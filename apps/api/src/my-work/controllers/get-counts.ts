import { and, eq, isNull, ne, sql } from "drizzle-orm";
import db from "../../database";
import { projectTable, taskTable } from "../../database/schema";
import { getEntriesInRange, getPreviousEntries } from "../../planner/queries";
import { urgentTaskIds } from "../../today/queries";
import { serverDayKey } from "../../utils/day-boundaries";
import { getWorkspaceColumns, notDoneCondition } from "../decorate";
import { TOTAL_CAP } from "../pagination";
import { assignedCondition } from "../scope";

/**
 * Los dos numeros de la barra lateral (ADR 046): "Hoy" y "Mis tareas".
 * Compone sobre las mismas condiciones que sus pantallas, pero solo cuenta
 * -sin decorar filas con etiquetas, asignados ni proyecto-, para que un
 * contador que se pide en cada carga de pagina no pague ese coste.
 */
export default async function getCounts({
  workspaceId,
  userId,
  now = new Date(),
}: {
  workspaceId: string;
  userId: string;
  now?: Date;
}) {
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setHours(23, 59, 59, 999);

  const projectColumns = await getWorkspaceColumns(workspaceId);
  const notDone = notDoneCondition(projectColumns);

  // Mismo tope y misma valla que `get-my-work.ts`: un `count(*)` sin limite
  // barreria el espacio entero para decir "500+".
  const cappedMyTasks = db
    .select({ id: taskTable.id })
    .from(taskTable)
    .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .where(
      and(
        eq(projectTable.workspaceId, workspaceId),
        isNull(projectTable.archivedAt),
        ne(taskTable.status, "archived"),
        assignedCondition(userId),
        ...(notDone ? [notDone] : []),
      ),
    )
    .limit(TOTAL_CAP + 1)
    .as("capped_my_tasks");

  const [previousRows, plannedRows, urgentRows, myTasksTotal] =
    await Promise.all([
      getPreviousEntries(
        workspaceId,
        userId,
        todayStart,
        notDone ? [notDone] : [],
      ),
      getEntriesInRange(
        workspaceId,
        userId,
        todayStart,
        todayEnd,
        notDone ? [notDone] : [],
      ),
      urgentTaskIds(workspaceId, userId, todayStart, now, notDone),
      db.select({ count: sql<number>`count(*)` }).from(cappedMyTasks),
    ]);

  const myTasksCount = Number(myTasksTotal[0]?.count ?? 0);

  return {
    today: previousRows.length + plannedRows.length + urgentRows.length,
    myTasks: Math.min(myTasksCount, TOTAL_CAP),
    serverToday: serverDayKey(now),
  };
}
