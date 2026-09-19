import { and, asc, eq, inArray, like, ne } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  columnTable,
  epicTable,
  labelTable,
  projectTable,
  taskEpicTable,
  taskTable,
  templateTable,
} from "../../database/schema";
import { subtreePattern } from "../../task/tree";
import {
  countTemplateTasks,
  MAX_TEMPLATE_TASKS,
  type TemplateNode,
} from "../content";

type TaskRow = {
  id: string;
  parentId: string | null;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  estimate: number | null;
  customFields: Record<string, unknown>;
  position: number | null;
};

/** Arma el arbol de plantilla a partir de filas planas de `task`. */
function buildNodes(
  rows: TaskRow[],
  rootParentId: string | null,
  labelsByTask: Map<string, Array<{ name: string; color: string }>>,
  epicsByTask: Map<string, string[]>,
): TemplateNode[] {
  return rows
    .filter((row) => row.parentId === rootParentId)
    .map((row) => ({
      title: row.title,
      description: row.description ?? undefined,
      priority: row.priority,
      status: row.status,
      estimate: row.estimate,
      labels: labelsByTask.get(row.id),
      epics: epicsByTask.get(row.id),
      customFields:
        Object.keys(row.customFields ?? {}).length > 0
          ? row.customFields
          : undefined,
      children: buildNodes(rows, row.id, labelsByTask, epicsByTask),
    }));
}

async function decorate(taskIds: string[]) {
  if (taskIds.length === 0) {
    return { labelsByTask: new Map(), epicsByTask: new Map() };
  }

  // Acotado a los ids del subarbol. Traerlas todas y filtrar en memoria seria
  // el mismo error que la Fase 4.5 tuvo que arreglar dos veces.
  const [labels, epics] = await Promise.all([
    db
      .select({
        taskId: labelTable.taskId,
        name: labelTable.name,
        color: labelTable.color,
      })
      .from(labelTable)
      .where(inArray(labelTable.taskId, taskIds)),
    db
      .select({ taskId: taskEpicTable.taskId, name: epicTable.name })
      .from(taskEpicTable)
      .innerJoin(epicTable, eq(taskEpicTable.epicId, epicTable.id))
      .where(inArray(taskEpicTable.taskId, taskIds)),
  ]);

  const labelsByTask = new Map<
    string,
    Array<{ name: string; color: string }>
  >();
  for (const label of labels) {
    if (!label.taskId) continue;
    const list = labelsByTask.get(label.taskId) ?? [];
    list.push({ name: label.name, color: label.color });
    labelsByTask.set(label.taskId, list);
  }

  const epicsByTask = new Map<string, string[]>();
  for (const epic of epics) {
    const list = epicsByTask.get(epic.taskId) ?? [];
    list.push(epic.name);
    epicsByTask.set(epic.taskId, list);
  }

  return { labelsByTask, epicsByTask };
}

/**
 * Guarda un subarbol como plantilla de tarea.
 *
 * **Lo que no viaja, y por que:** responsables, equipos, fechas y tiempo
 * registrado. Una plantilla describe *que* hay que hacer, no quien lo hizo ni
 * cuando; copiar el responsable de la ultima vez es como se acaba asignando
 * trabajo a quien ya no esta.
 */
export async function captureTaskTemplate({
  taskId,
  name,
  description,
  currentUserId,
}: {
  taskId: string;
  name: string;
  description?: string | null;
  currentUserId: string;
}) {
  const root = await db.query.taskTable.findFirst({
    where: eq(taskTable.id, taskId),
  });

  if (!root) throw new HTTPException(404, { message: "Task not found" });

  const rows = (await db
    .select({
      id: taskTable.id,
      parentId: taskTable.parentId,
      title: taskTable.title,
      description: taskTable.description,
      priority: taskTable.priority,
      status: taskTable.status,
      estimate: taskTable.estimate,
      customFields: taskTable.customFields,
      position: taskTable.position,
    })
    .from(taskTable)
    .where(
      and(
        eq(taskTable.projectId, root.projectId),
        like(taskTable.path, subtreePattern(root.path)),
        ne(taskTable.status, "archived"),
      ),
    )
    .orderBy(asc(taskTable.position))) as TaskRow[];

  const { labelsByTask, epicsByTask } = await decorate(
    rows.map((row) => row.id),
  );

  const tasks = buildNodes(rows, root.parentId, labelsByTask, epicsByTask);
  const total = countTemplateTasks(tasks);

  if (total > MAX_TEMPLATE_TASKS) {
    throw new HTTPException(400, {
      message: `A template cannot hold more than ${MAX_TEMPLATE_TASKS} tasks`,
    });
  }

  const [project] = await db
    .select({ workspaceId: projectTable.workspaceId })
    .from(projectTable)
    .where(eq(projectTable.id, root.projectId));

  if (!project) {
    throw new HTTPException(404, { message: "Project not found" });
  }

  const [created] = await db
    .insert(templateTable)
    .values({
      workspaceId: project.workspaceId,
      name: name.trim(),
      description: description ?? null,
      kind: "task",
      content: { tasks },
      createdBy: currentUserId,
    })
    .returning();

  return created;
}

/** Guarda un proyecto entero —columnas, epicas y arbol— como plantilla. */
export async function captureProjectTemplate({
  projectId,
  name,
  description,
  currentUserId,
}: {
  projectId: string;
  name: string;
  description?: string | null;
  currentUserId: string;
}) {
  const project = await db.query.projectTable.findFirst({
    where: eq(projectTable.id, projectId),
  });

  if (!project) throw new HTTPException(404, { message: "Project not found" });

  const [columns, epics, rows] = await Promise.all([
    db
      .select({
        name: columnTable.name,
        slug: columnTable.slug,
        position: columnTable.position,
        isFinal: columnTable.isFinal,
      })
      .from(columnTable)
      .where(eq(columnTable.projectId, projectId))
      .orderBy(asc(columnTable.position)),
    db
      .select({ name: epicTable.name, color: epicTable.color })
      .from(epicTable)
      .where(eq(epicTable.projectId, projectId)),
    db
      .select({
        id: taskTable.id,
        parentId: taskTable.parentId,
        title: taskTable.title,
        description: taskTable.description,
        priority: taskTable.priority,
        status: taskTable.status,
        estimate: taskTable.estimate,
        customFields: taskTable.customFields,
        position: taskTable.position,
      })
      .from(taskTable)
      .where(
        and(
          eq(taskTable.projectId, projectId),
          ne(taskTable.status, "archived"),
        ),
      )
      .orderBy(asc(taskTable.position)),
  ]);

  const { labelsByTask, epicsByTask } = await decorate(
    rows.map((row) => row.id),
  );

  const tasks = buildNodes(rows as TaskRow[], null, labelsByTask, epicsByTask);

  if (countTemplateTasks(tasks) > MAX_TEMPLATE_TASKS) {
    throw new HTTPException(400, {
      message: `A template cannot hold more than ${MAX_TEMPLATE_TASKS} tasks`,
    });
  }

  const [created] = await db
    .insert(templateTable)
    .values({
      workspaceId: project.workspaceId,
      name: name.trim(),
      description: description ?? null,
      kind: "project",
      content: { columns, epics, tasks },
      createdBy: currentUserId,
    })
    .returning();

  return created;
}
