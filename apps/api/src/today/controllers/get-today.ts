import { and, between, eq, isNotNull, or } from "drizzle-orm";
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
import { serverDayKey } from "../../utils/day-boundaries";
import { dayCapacitySeconds } from "../../work-schedule/day-capacity";
import { getWorkSchedule } from "../../work-schedule/get-work-schedule";
import { urgentTasksQuery } from "../queries";

function endOfDay(dayStart: Date): Date {
  const end = new Date(dayStart);
  end.setHours(23, 59, 59, 999);
  return end;
}

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
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = endOfDay(todayStart);
  const todayKey = serverDayKey(now);

  const [projectColumns, schedule, { blocksByDay }] = await Promise.all([
    getWorkspaceColumns(workspaceId),
    getWorkSchedule(userId),
    loadBlocksByDay(workspaceId, userId, todayStart, todayEnd),
  ]);

  const breakIntervals = (blocksByDay.get(todayKey) ?? [])
    .filter((block) => block.kind === "break")
    .map((block) => ({
      startMinute: block.startMinute,
      endMinute: block.endMinute,
    }));
  const capacitySeconds = dayCapacitySeconds(
    schedule,
    todayStart,
    breakIntervals,
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

  const plannedWithLogged = withLogged(planned);
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
