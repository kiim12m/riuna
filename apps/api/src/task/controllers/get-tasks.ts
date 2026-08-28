import {
  and,
  asc,
  desc,
  eq,
  exists,
  gte,
  inArray,
  isNull,
  lte,
  type SQL,
  sql,
} from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  columnTable,
  externalLinkTable,
  labelTable,
  projectTable,
  taskEpicTable,
  taskTable,
  teamTable,
  userTable,
} from "../../database/schema";
import { getEpicsByTask } from "../../epic/controllers/get-epics";
import { getFieldDefinitionsForProject } from "../../field/controllers/get-field-definitions";
import { buildFieldRegistry } from "../../view/field-registry";
import { type FilterNode, filterToSql } from "../../view/filter-to-sql";
import {
  getProjectSubtreeAggregates,
  serializeAggregate,
} from "../tree-aggregates";

type GetTasksOptions = {
  assigneeId?: string;
  epicId?: string;
  rootsOnly?: boolean;
  /**
   * Que hace el filtro con la jerarquia.
   *
   * - `matching`: solo las tareas que casan. Una rama cuyo padre casa pierde
   *   las hijas que no casan, que es lo que pasa hoy.
   * - `roots`: solo las tareas de primer nivel que casan.
   * - `withDescendants`: las que casan mas todo lo que cuelga de ellas, para
   *   ver la rama entera de lo que el filtro ha encontrado.
   */
  treeScope?: "matching" | "roots" | "withDescendants";
  dueAfter?: string;
  dueBefore?: string;
  limit?: number;
  page?: number;
  priority?: string;
  sortBy?:
    | "createdAt"
    | "priority"
    | "dueDate"
    | "position"
    | "title"
    | "number";
  sortOrder?: "asc" | "desc";
  status?: string;
  // El arbol de filtros del motor de vistas. Convive con las opciones sueltas
  // de arriba en vez de sustituirlas: tablero, lista y backlog siguen
  // mandando las suyas, y migrarlas es trabajo de esta misma fase. Las dos se
  // combinan con AND, asi que un filtro nuevo nunca ensancha uno viejo.
  filter?: FilterNode | null;
};

const priorityCaseExpr = sql<number>`CASE
  WHEN ${taskTable.priority} = 'urgent' THEN 4
  WHEN ${taskTable.priority} = 'high' THEN 3
  WHEN ${taskTable.priority} = 'medium' THEN 2
  WHEN ${taskTable.priority} = 'low' THEN 1
  ELSE 0
END`;

function buildOrderBy(
  sortBy: GetTasksOptions["sortBy"],
  sortOrder: GetTasksOptions["sortOrder"],
): SQL {
  const direction = sortOrder === "desc" ? desc : asc;

  switch (sortBy) {
    case "createdAt":
      return direction(taskTable.createdAt);
    case "priority":
      return direction(priorityCaseExpr);
    case "dueDate":
      return direction(taskTable.dueDate);
    case "title":
      return direction(taskTable.title);
    case "number":
      return direction(taskTable.number);
    default:
      return direction(taskTable.position);
  }
}

async function getTasks(projectId: string, options: GetTasksOptions = {}) {
  const project = await db.query.projectTable.findFirst({
    where: eq(projectTable.id, projectId),
  });

  if (!project) {
    throw new HTTPException(404, {
      message: "Project not found",
    });
  }

  const conditions = [eq(taskTable.projectId, projectId)];

  if (options.status) {
    conditions.push(eq(taskTable.status, options.status));
  }

  if (options.priority) {
    conditions.push(eq(taskTable.priority, options.priority));
  }

  if (options.assigneeId) {
    conditions.push(eq(taskTable.userId, options.assigneeId));
  }

  if (options.dueBefore) {
    conditions.push(lte(taskTable.dueDate, new Date(options.dueBefore)));
  }

  if (options.dueAfter) {
    conditions.push(gte(taskTable.dueDate, new Date(options.dueAfter)));
  }

  // Filtrar por epica en la propia consulta y no despues: una vista paginada
  // que filtrase en memoria devolveria paginas incompletas.
  if (options.epicId) {
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(taskEpicTable)
          .where(
            and(
              eq(taskEpicTable.taskId, taskTable.id),
              eq(taskEpicTable.epicId, options.epicId),
            ),
          ),
      ),
    );
  }

  if (options.rootsOnly) {
    conditions.push(isNull(taskTable.parentId));
  }

  if (options.treeScope === "roots") {
    conditions.push(isNull(taskTable.parentId));
  }

  if (options.filter) {
    // El registro se construye con las definiciones que aplican al proyecto,
    // que es lo que hace que `custom.presupuesto` exista como campo filtrable
    // aqui y no en un proyecto que no lo haya definido.
    const definitions = await getFieldDefinitionsForProject(
      project.workspaceId,
      projectId,
    );

    const filterSql = filterToSql(
      options.filter,
      buildFieldRegistry(definitions),
    );

    if (filterSql) {
      if (options.treeScope === "withDescendants") {
        // "Lo que casa, mas su rama". El filtro va dentro de su propia
        // subconsulta, cuyo FROM es `task`: alli `"task"."x"` se resuelve
        // contra esa copia y no contra la de fuera. En el nivel intermedio el
        // FROM es `task ancestor`, asi que el `task.path` de en medio si
        // apunta a la fila externa. Sin ese escalon habria que alias-ar el
        // traductor entero.
        conditions.push(
          sql`(${filterSql} OR EXISTS (
            SELECT 1 FROM ${taskTable} ancestor
            WHERE ancestor.project_id = ${projectId}
              AND ${taskTable.path} LIKE ancestor.path || '_%'
              AND ancestor.id IN (
                SELECT id FROM ${taskTable}
                WHERE ${taskTable.projectId} = ${projectId} AND ${filterSql}
              )
          ))`,
        );
      } else {
        conditions.push(filterSql);
      }
    }
  }

  const whereClause = and(...conditions);
  const usePagination = options.page != null || options.limit != null;
  const page = options.page && options.page > 0 ? options.page : 1;
  const pageSize =
    options.limit && options.limit > 0 ? Math.min(options.limit, 100) : 50;
  const offset = (page - 1) * pageSize;

  const orderByClause = buildOrderBy(
    options.sortBy ?? "position",
    options.sortOrder ?? "asc",
  );

  const [taskCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(taskTable)
    .where(whereClause);

  const total = Number(taskCount?.count ?? 0);

  const taskSelection = {
    id: taskTable.id,
    title: taskTable.title,
    number: taskTable.number,
    description: taskTable.description,
    status: taskTable.status,
    priority: taskTable.priority,
    startDate: taskTable.startDate,
    dueDate: taskTable.dueDate,
    position: taskTable.position,
    createdAt: taskTable.createdAt,
    userId: taskTable.userId,
    assigneeName: userTable.name,
    assigneeId: userTable.id,
    assigneeImage: userTable.image,
    teamId: taskTable.teamId,
    teamName: teamTable.name,
    projectId: taskTable.projectId,
    parentId: taskTable.parentId,
    path: taskTable.path,
    depth: taskTable.depth,
    estimate: taskTable.estimate,
    customFields: taskTable.customFields,
  };

  const query = db
    .select(taskSelection)
    .from(taskTable)
    .leftJoin(userTable, eq(taskTable.userId, userTable.id))
    .leftJoin(teamTable, eq(taskTable.teamId, teamTable.id))
    .leftJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .where(whereClause)
    .orderBy(orderByClause);

  const paginatedTasks = usePagination
    ? await query.limit(pageSize).offset(offset)
    : await query;

  const taskIds = paginatedTasks.map((task) => task.id);

  const labelsData =
    taskIds.length > 0
      ? await db
          .select({
            id: labelTable.id,
            name: labelTable.name,
            color: labelTable.color,
            taskId: labelTable.taskId,
          })
          .from(labelTable)
          .where(inArray(labelTable.taskId, taskIds))
      : [];

  const externalLinksData =
    taskIds.length > 0
      ? await db
          .select()
          .from(externalLinkTable)
          .where(inArray(externalLinkTable.taskId, taskIds))
      : [];

  const taskLabelsMap = new Map<
    string,
    Array<{ id: string; name: string; color: string }>
  >();
  for (const label of labelsData) {
    if (label.taskId) {
      if (!taskLabelsMap.has(label.taskId)) {
        taskLabelsMap.set(label.taskId, []);
      }
      taskLabelsMap.get(label.taskId)?.push({
        id: label.id,
        name: label.name,
        color: label.color,
      });
    }
  }

  const taskExternalLinksMap = new Map<
    string,
    Array<{
      id: string;
      taskId: string;
      integrationId: string;
      resourceType: string;
      externalId: string;
      url: string;
      title: string | null;
      metadata: Record<string, unknown> | null;
    }>
  >();
  for (const externalLink of externalLinksData) {
    if (!taskExternalLinksMap.has(externalLink.taskId)) {
      taskExternalLinksMap.set(externalLink.taskId, []);
    }
    taskExternalLinksMap.get(externalLink.taskId)?.push({
      ...externalLink,
      metadata: externalLink.metadata
        ? JSON.parse(externalLink.metadata)
        : null,
    });
  }

  const [aggregates, epicsByTask] = await Promise.all([
    getProjectSubtreeAggregates(projectId),
    getEpicsByTask(projectId),
  ]);

  const decorate = (task: (typeof paginatedTasks)[number]) => ({
    ...task,
    labels: taskLabelsMap.get(task.id) || [],
    externalLinks: taskExternalLinksMap.get(task.id) || [],
    epics: epicsByTask.get(task.id) || [],
    subtree: serializeAggregate(aggregates.get(task.id), {
      startDate: task.startDate,
      dueDate: task.dueDate,
    }),
  });

  const projectColumns = await db
    .select()
    .from(columnTable)
    .where(eq(columnTable.projectId, projectId))
    .orderBy(asc(columnTable.position));

  const columns = projectColumns.map((column) => ({
    id: column.slug,
    slug: column.slug,
    name: column.name,
    icon: column.icon,
    isFinal: column.isFinal,
    tasks: paginatedTasks
      .filter((task) => task.status === column.slug)
      .map(decorate),
  }));

  const archivedTasks = paginatedTasks
    .filter((task) => task.status === "archived")
    .map(decorate);

  const plannedTasks = paginatedTasks
    .filter((task) => task.status === "planned")
    .map(decorate);

  return {
    data: {
      id: project.id,
      name: project.name,
      slug: project.slug,
      icon: project.icon,
      description: project.description,
      isPublic: project.isPublic,
      workspaceId: project.workspaceId,
      // Ajustes del arbol: viajan con el proyecto para que la pantalla que los
      // edita no tenga que resolver antes el espacio de trabajo.
      cascadeClose: project.cascadeClose,
      cascadeArchive: project.cascadeArchive,
      maxTaskDepth: project.maxTaskDepth,
      columns,
      archivedTasks,
      plannedTasks,
    },
    pagination: usePagination
      ? {
          total,
          page,
          pageSize,
          totalPages: Math.max(1, Math.ceil(total / pageSize)),
        }
      : {
          total,
          page: 1,
          pageSize: total,
          totalPages: 1,
        },
  };
}

export default getTasks;
