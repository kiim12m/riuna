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
import { projectTable, taskTable, teamTable } from "../../database/schema";
import { addDays, startOfServerDay } from "../../utils/day-boundaries";
import { priorityRankExpression } from "../../view/field-registry";
import {
  decorateTasks,
  getWorkspaceColumns,
  notDoneCondition,
} from "../decorate";
import { emptyPage, resolvePaging, TOTAL_CAP } from "../pagination";
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
  const { page, pageSize, offset } = resolvePaging(requestedPage, limit);

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
    const notDone = notDoneCondition(projectColumns);
    if (notDone) conditions.push(notDone);
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

  const tasks = await decorateTasks(pageRows, projectColumns);

  return {
    tasks,
    pagination: { page, pageSize, hasMore, total, totalIsCapped },
  };
}

export default getMyWork;
