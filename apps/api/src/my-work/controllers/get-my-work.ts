import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  ne,
  type SQL,
  sql,
} from "drizzle-orm";
import db from "../../database";
import {
  columnTable,
  labelTable,
  projectTable,
  taskAssigneeTable,
  taskTable,
  teamTable,
  userTable,
} from "../../database/schema";
import { addDays, startOfServerDay } from "../../utils/day-boundaries";
import { priorityRankExpression } from "../../view/field-registry";
import { assignedCondition, resolveTeamIds } from "../scope";

export type MyWorkScope = "assigned" | "team";
export type MyWorkDueWindow = "all" | "overdue" | "today" | "week";

type GetMyWorkOptions = {
  workspaceId: string;
  userId: string;
  scope: MyWorkScope;
  includeDone?: boolean;
  due?: MyWorkDueWindow;
  projectId?: string;
  page?: number;
  limit?: number;
};

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

/**
 * Tope del recuento. Por encima se devuelve el tope con `totalIsCapped`, y la
 * web escribe "500+".
 *
 * El tope es lo que hace asumible la cuenta: el `LIMIT` va **dentro** de la
 * subconsulta, asi que Postgres para en cuanto junta 501 filas en vez de barrer
 * el espacio entero. Sin el, esto seria la cuenta siempre encendida que
 * `get-tasks.ts` documenta como error —evaluar dos veces la misma clausula
 * WHERE completa—.
 */
const TOTAL_CAP = 500;

/** El slug que Kaneo daba por terminado antes de que las columnas fueran configurables. */
const LEGACY_FINAL_STATUS = "done";

type ProjectColumn = {
  slug: string;
  name: string;
  icon: string | null;
  isFinal: boolean;
};

type ProjectColumns = {
  columns: ProjectColumn[];
  /** Los estados que cuentan como terminados en **este** proyecto. */
  finals: string[];
};

/**
 * Ventana de vencimiento, en dias del servidor.
 *
 * Las fronteras salen de `utils/day-boundaries`, compartidas con los paneles
 * de la Fase 7: calcularlas dos veces era pedir que "hoy" acabara significando
 * cosas distintas en dos pantallas.
 */
function dueWindowCondition(due: MyWorkDueWindow, now: Date): SQL | undefined {
  if (due === "all") return undefined;

  const startOfToday = startOfServerDay(now);

  // Una fecha nula hace NULL la comparacion, no true, asi que las tareas sin
  // vencimiento quedan fuera de las tres ventanas sin pedirlo explicitamente.
  if (due === "overdue") {
    return lt(taskTable.dueDate, startOfToday);
  }

  const endOfWindow = addDays(startOfToday, due === "today" ? 1 : 7);

  return and(
    gte(taskTable.dueDate, startOfToday),
    lt(taskTable.dueDate, endOfWindow),
  );
}

/**
 * Las columnas de los proyectos vivos del espacio, con "hecho" ya resuelto.
 *
 * Una sola consulta que sirve para las **dos** cosas que necesitan la regla:
 * el predicado SQL que excluye lo terminado y la bandera `isDone` que decora
 * cada fila. Escribirla dos veces —una en SQL correlado y otra en JavaScript—
 * era pedir que divergieran; asi solo hay un `finals` por proyecto y las dos
 * lo leen.
 *
 * `getFinalStatuses` (`task/tree-aggregates.ts`) hace lo mismo para un unico
 * proyecto, incluido el respaldo al slug `done` heredado, pero es privada de su
 * modulo. El respaldo se reproduce aqui para que una instalacion heredada, sin
 * columnas marcadas como finales, siga viendo terminado lo que ya veia.
 */
async function getWorkspaceColumns(
  workspaceId: string,
): Promise<Map<string, ProjectColumns>> {
  const rows = await db
    .select({
      projectId: projectTable.id,
      slug: columnTable.slug,
      name: columnTable.name,
      icon: columnTable.icon,
      isFinal: columnTable.isFinal,
    })
    .from(projectTable)
    .leftJoin(columnTable, eq(columnTable.projectId, projectTable.id))
    .where(
      and(
        eq(projectTable.workspaceId, workspaceId),
        isNull(projectTable.archivedAt),
      ),
    )
    .orderBy(asc(columnTable.position));

  const columnsByProject = new Map<string, ProjectColumn[]>();

  for (const row of rows) {
    const list = columnsByProject.get(row.projectId) ?? [];
    // El LEFT JOIN deja las columnas a null en un proyecto que no tiene
    // ninguna: la entrada existe igual, con la lista vacia, para que el
    // respaldo se le aplique.
    if (row.slug !== null) {
      list.push({
        slug: row.slug,
        name: row.name ?? row.slug,
        icon: row.icon,
        isFinal: row.isFinal ?? false,
      });
    }
    columnsByProject.set(row.projectId, list);
  }

  const result = new Map<string, ProjectColumns>();

  for (const [projectId, columns] of columnsByProject) {
    const finals = columns
      .filter((column) => column.isFinal)
      .map((column) => column.slug);

    result.set(projectId, {
      columns,
      finals: finals.length > 0 ? finals : [LEGACY_FINAL_STATUS],
    });
  }

  return result;
}

function emptyPage(page: number, pageSize: number) {
  return {
    tasks: [],
    pagination: {
      page,
      pageSize,
      hasMore: false,
      total: 0,
      totalIsCapped: false,
    },
  };
}

async function getMyWork({
  workspaceId,
  userId,
  scope,
  includeDone = false,
  due = "all",
  projectId,
  page: requestedPage,
  limit,
}: GetMyWorkOptions) {
  const page = requestedPage && requestedPage > 0 ? requestedPage : 1;
  const pageSize =
    limit && limit > 0 ? Math.min(limit, MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE;
  const offset = (page - 1) * pageSize;

  const projectColumns = await getWorkspaceColumns(workspaceId);

  const conditions: SQL[] = [
    eq(projectTable.workspaceId, workspaceId),
    // Un proyecto archivado no aporta trabajo pendiente a nadie.
    isNull(projectTable.archivedAt),
    ne(taskTable.status, "archived"),
  ];

  if (projectId) {
    conditions.push(eq(taskTable.projectId, projectId));
  }

  const dueCondition = dueWindowCondition(due, new Date());
  if (dueCondition) {
    conditions.push(dueCondition);
  }

  if (scope === "assigned") {
    // La valla `OFFSET 0` y su medicion viven en `my-work/scope.ts`, que es
    // tambien lo que usan los widgets del panel.
    conditions.push(assignedCondition(userId));
  } else {
    const teamIds = await resolveTeamIds(workspaceId, userId);

    // Sin esta salida temprana, `inArray(col, [])` compila a `in ()`, que es un
    // error de sintaxis de Postgres: un 500 para todo el que no pertenezca a
    // ningun equipo, que es la mayoria de la gente el primer dia.
    if (teamIds.length === 0) {
      return emptyPage(page, pageSize);
    }

    conditions.push(inArray(taskTable.teamId, teamIds));
  }

  if (!includeDone) {
    // Los pares (proyecto, estado) que cuentan como terminados, ya resueltos en
    // memoria. La forma anterior —un `NOT EXISTS` correlado contra `column`—
    // obligaba a Postgres a reejecutar un subplan **una vez por tarea**: 50.000
    // vueltas y 100.000 buffers para descartar cuatro filas cada vez. Como lista
    // literal es un filtro normal que se aplica dentro del propio barrido.
    const finalPairs: SQL[] = [];

    for (const [id, { finals }] of projectColumns) {
      for (const slug of finals) {
        finalPairs.push(sql`(${id}, ${slug})`);
      }
    }

    if (finalPairs.length > 0) {
      conditions.push(
        sql`(${taskTable.projectId}, ${taskTable.status}) NOT IN (${sql.join(
          finalPairs,
          sql`, `,
        )})`,
      );
    }
  }

  // El recuento topado, para que la seccion pueda decir cuanto tienes pendiente
  // y no cuantas filas caben en la pagina. Va en la misma tanda que la consulta
  // de pagina para no sumar su latencia a la respuesta.
  const cappedTotal = db
    .select({ id: taskTable.id })
    .from(taskTable)
    .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .where(and(...conditions))
    .limit(TOTAL_CAP + 1)
    .as("capped_total");

  // `hasMore` sigue saliendo de pedir una fila de mas, no del total: el total
  // esta topado y a partir del tope no sabria decir si queda pagina siguiente.
  const [rows, totalRows] = await Promise.all([
    db
      .select({
        id: taskTable.id,
        number: taskTable.number,
        title: taskTable.title,
        status: taskTable.status,
        priority: taskTable.priority,
        startDate: taskTable.startDate,
        dueDate: taskTable.dueDate,
        createdAt: taskTable.createdAt,
        userId: taskTable.userId,
        parentId: taskTable.parentId,
        depth: taskTable.depth,
        projectId: taskTable.projectId,
        projectName: projectTable.name,
        projectSlug: projectTable.slug,
        projectIcon: projectTable.icon,
        teamId: taskTable.teamId,
        teamName: teamTable.name,
      })
      .from(taskTable)
      .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
      .leftJoin(teamTable, eq(taskTable.teamId, teamTable.id))
      .where(and(...conditions))
      // La fecha manda porque la pagina responde "que vence antes", que es su
      // razon de ser. El id cierra el orden: sin un orden total, dos paginas
      // consecutivas pueden solaparse o saltarse una fila.
      .orderBy(
        sql`${taskTable.dueDate} ASC NULLS LAST`,
        desc(priorityRankExpression),
        asc(taskTable.id),
      )
      .limit(pageSize + 1)
      .offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(cappedTotal),
  ]);

  const countedRows = Number(totalRows[0]?.count ?? 0);
  const totalIsCapped = countedRows > TOTAL_CAP;
  const total = totalIsCapped ? TOTAL_CAP : countedRows;

  const hasMore = rows.length > pageSize;
  const pageRows = hasMore ? rows.slice(0, pageSize) : rows;

  if (pageRows.length === 0) {
    // No es `emptyPage`: esa es la salida de "no hay nada que contar". Aqui la
    // pagina pedida se ha quedado sin filas, pero el total sigue siendo cierto.
    return {
      tasks: [],
      pagination: { page, pageSize, hasMore: false, total, totalIsCapped },
    };
  }

  const taskIds = pageRows.map((row) => row.id);

  // Dos consultas por lotes acotadas a los ids de la pagina, nunca una por
  // fila. Sin agregados del arbol: son por proyecto, y la Fase 4.5 los midio en
  // 242 ms fijos.
  const [labelRows, assigneeRows] = await Promise.all([
    db
      .select({
        id: labelTable.id,
        name: labelTable.name,
        color: labelTable.color,
        taskId: labelTable.taskId,
      })
      .from(labelTable)
      .where(inArray(labelTable.taskId, taskIds)),
    db
      .select({
        taskId: taskAssigneeTable.taskId,
        id: userTable.id,
        name: userTable.name,
        image: userTable.image,
      })
      .from(taskAssigneeTable)
      .innerJoin(userTable, eq(taskAssigneeTable.userId, userTable.id))
      .where(inArray(taskAssigneeTable.taskId, taskIds))
      .orderBy(asc(taskAssigneeTable.createdAt)),
  ]);

  const labelsByTask = new Map<
    string,
    Array<{ id: string; name: string; color: string }>
  >();
  for (const label of labelRows) {
    if (!label.taskId) continue;
    const list = labelsByTask.get(label.taskId) ?? [];
    list.push({ id: label.id, name: label.name, color: label.color });
    labelsByTask.set(label.taskId, list);
  }

  const assigneesByTask = new Map<
    string,
    Array<{ id: string; name: string; image: string | null }>
  >();
  for (const assignee of assigneeRows) {
    const list = assigneesByTask.get(assignee.taskId) ?? [];
    list.push({
      id: assignee.id,
      name: assignee.name,
      image: assignee.image,
    });
    assigneesByTask.set(assignee.taskId, list);
  }

  const tasks = pageRows.map((row) => {
    const project = projectColumns.get(row.projectId);

    return {
      ...row,
      statusColumn:
        project?.columns.find((column) => column.slug === row.status) ?? null,
      // La misma lista `finals` que ha construido el predicado de arriba.
      isDone:
        project?.finals.includes(row.status) ??
        row.status === LEGACY_FINAL_STATUS,
      labels: labelsByTask.get(row.id) ?? [],
      assignees: assigneesByTask.get(row.id) ?? [],
    };
  });

  return {
    tasks,
    pagination: { page, pageSize, hasMore, total, totalIsCapped },
  };
}

export default getMyWork;
