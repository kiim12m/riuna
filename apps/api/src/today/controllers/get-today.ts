import { and, between, eq, isNotNull, isNull, ne, or } from "drizzle-orm";
import db from "../../database";
import {
  personalPlanEntryTable,
  projectTable,
  taskTable,
  teamTable,
} from "../../database/schema";
import {
  decorateTasks,
  getWorkspaceColumns,
  notDoneCondition,
} from "../../my-work/decorate";
import { assignedCondition } from "../../my-work/scope";
import {
  getEntriesInRange,
  getPreviousEntries,
  loggedSecondsByTask,
  taskColumns,
} from "../../planner/queries";
import { loadBlocksByDay } from "../../schedule/blocks-by-day";
import getTimeSheet from "../../time-sheet/controllers/get-time-sheet";
import {
  endOfServerDay,
  serverDayKey,
  startOfServerDay,
} from "../../utils/day-boundaries";
import { capacityForDay } from "../../work-schedule/day-capacity";
import { getWorkSchedule } from "../../work-schedule/get-work-schedule";
import { urgentTasksQuery } from "../queries";

/**
 * Hoy: el plan del dia mas lo urgente (ADR 046), composicion pura sobre lo
 * que el Planificador ya lee -mismas consultas de `planner/queries.ts`, para
 * que una tarea atrasada se vea igual en los dos sitios-.
 */
export default async function getToday({
  workspaceId,
  userId,
  now = new Date(),
}: {
  workspaceId: string;
  userId: string;
  now?: Date;
}) {
  const todayStart = startOfServerDay(now);
  const todayEnd = endOfServerDay(now);
  const todayKey = serverDayKey(now);

  const [projectColumns, schedule, { blocksByDay }] = await Promise.all([
    getWorkspaceColumns(workspaceId),
    getWorkSchedule(userId),
    loadBlocksByDay(workspaceId, userId, todayStart, todayEnd),
  ]);

  const capacitySeconds = capacityForDay(
    schedule,
    todayStart,
    blocksByDay.get(todayKey) ?? [],
  );

  const notDone = notDoneCondition(projectColumns);

  const [previousRows, plannedRows, doneRows, urgentRows, timeSheet] =
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
      // Terminadas hoy, y relevantes -asignadas o planificadas para hoy-: una
      // tarea de otro que nadie de por aqui planifico no es "lo que hice
      // hoy".
      db
        .select(taskColumns)
        .from(taskTable)
        .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
        .leftJoin(teamTable, eq(taskTable.teamId, teamTable.id))
        .leftJoin(
          personalPlanEntryTable,
          and(
            eq(personalPlanEntryTable.taskId, taskTable.id),
            eq(personalPlanEntryTable.userId, userId),
            eq(personalPlanEntryTable.plannedDate, todayStart),
          ),
        )
        .where(
          and(
            eq(projectTable.workspaceId, workspaceId),
            isNull(projectTable.archivedAt),
            ne(taskTable.status, "archived"),
            isNotNull(taskTable.completedAt),
            between(taskTable.completedAt, todayStart, todayEnd),
            or(
              assignedCondition(userId),
              isNotNull(personalPlanEntryTable.taskId),
            ),
          ),
        ),
      // Vencido o vence hoy, sin planificar hoy ni antes -si ya tiene un
      // hueco en `previous`/`planned` no hace falta pedirselo dos veces-.
      urgentTasksQuery(workspaceId, userId, todayStart, now, notDone),
      getTimeSheet({
        workspaceId,
        userId,
        windowStart: todayStart,
        windowEnd: todayEnd,
        groupBy: "day",
        now,
      }),
    ]);

  const loggedByTask = await loggedSecondsByTask([
    ...previousRows.map((row) => row.id),
    ...plannedRows.map((row) => row.id),
    ...doneRows.map((row) => row.id),
  ]);

  const [previous, planned, done, urgent] = await Promise.all([
    decorateTasks(previousRows, projectColumns),
    decorateTasks(plannedRows, projectColumns),
    decorateTasks(doneRows, projectColumns),
    decorateTasks(urgentRows, projectColumns),
  ]);

  const withLogged = <T extends { id: string }>(rows: T[]) =>
    rows.map((row) => ({
      ...row,
      loggedSeconds: loggedByTask.get(row.id) ?? 0,
    }));

  // Las imprescindibles primero, por su puesto (ADR 053); el resto, en el
  // orden del plan. `sort` es estable, asi que dentro de cada grupo se
  // conserva el de `position`.
  const plannedWithLogged = withLogged(planned).sort(
    (a, b) => (a.keyRank ?? 4) - (b.keyRank ?? 4),
  );
  const estimateRemaining = plannedWithLogged.reduce(
    (total, row) =>
      total + Math.max(0, (row.estimate ?? 0) - row.loggedSeconds),
    0,
  );

  return {
    previous: withLogged(previous),
    planned: plannedWithLogged,
    urgent,
    done: withLogged(done),
    totals: {
      estimateRemaining,
      workedToday: timeSheet.totalSeconds,
      capacitySeconds,
    },
    serverToday: todayKey,
  };
}
