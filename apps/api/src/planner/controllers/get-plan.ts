import { and, between, eq, isNull, ne, type SQL, sql } from "drizzle-orm";
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
import { loadBlocksByDay } from "../../schedule/blocks-by-day";
import {
  dayKeysBetween,
  parseServerDay,
  serverDayKey,
} from "../../utils/day-boundaries";
import { workspaceTaskConditions } from "../../view/workspace-task-query";
import { capacityForDay } from "../../work-schedule/day-capacity";
import { getWorkSchedule } from "../../work-schedule/get-work-schedule";
import { computeGhosts } from "../ghosts";
import {
  getEntriesInRange,
  getPreviousEntries,
  loggedSecondsByTask,
  taskColumns,
} from "../queries";

/** Ninguna fila en `personal_plan_entry`, sin importar la fecha (ADR 040). */
function notPlannedCondition(userId: string) {
  return sql`NOT EXISTS (
    SELECT 1 FROM ${personalPlanEntryTable}
    WHERE ${personalPlanEntryTable.userId} = ${userId}
    AND ${personalPlanEntryTable.taskId} = ${taskTable.id}
  )`;
}

export default async function getPlan({
  workspaceId,
  userId,
  windowStart,
  windowEnd,
  now = new Date(),
}: {
  workspaceId: string;
  userId: string;
  windowStart: Date;
  windowEnd: Date;
  now?: Date;
}) {
  const serverToday = serverDayKey(now);
  const [projectColumns, scopeConditions, schedule, { blocksByDay }] =
    await Promise.all([
      getWorkspaceColumns(workspaceId),
      workspaceTaskConditions({
        workspaceId,
        userId,
        scope: "assigned",
        filter: null,
        registry: {},
      }),
      getWorkSchedule(userId),
      loadBlocksByDay(workspaceId, userId, windowStart, windowEnd),
    ]);

  const capacityByDay: Record<string, number> = {};
  const fixedBlocksByDay: Record<
    string,
    { id: string; title: string; startMinute: number; endMinute: number }[]
  > = {};
  for (const dayKey of dayKeysBetween(windowStart, windowEnd)) {
    const dayBlocks = blocksByDay.get(dayKey) ?? [];
    capacityByDay[dayKey] = capacityForDay(
      schedule,
      parseServerDay(dayKey, "day"),
      dayBlocks,
    );
    fixedBlocksByDay[dayKey] = dayBlocks
      .filter((block) => block.kind === "fixed")
      .map((block) => ({
        id: block.id,
        title: block.title,
        startMinute: block.startMinute,
        endMinute: block.endMinute,
      }));
  }

  // El ambito "assigned" siempre resuelve a un predicado -nunca depende de
  // equipos-, pero el tipo lo comparte con "team" y hay que descartar el
  // `null` para TypeScript.
  if (!scopeConditions) {
    return {
      entries: [],
      previous: [],
      unplanned: [],
      deadlines: [],
      ghosts: [],
      capacityByDay,
      fixedBlocksByDay,
      serverToday,
    };
  }

  const notDone = notDoneCondition(projectColumns);
  const unplannedConditions: SQL[] = [
    ...scopeConditions,
    notPlannedCondition(userId),
  ];
  if (notDone) unplannedConditions.push(notDone);

  const deadlineConditions: SQL[] = [
    eq(projectTable.workspaceId, workspaceId),
    // Sin esto un proyecto archivado, o una tarea archivada, seguia
    // asomando en "vence este dia" -la unica lista de la pantalla que no
    // pasaba por `workspaceTaskConditions`, que ya lo hace por "sin
    // planificar"-.
    isNull(projectTable.archivedAt),
    ne(taskTable.status, "archived"),
    assignedCondition(userId),
    between(taskTable.dueDate, windowStart, windowEnd),
  ];
  if (notDone) deadlineConditions.push(notDone);

  const [entryRows, previousRows, unplannedRows, deadlineRows, ghosts] =
    await Promise.all([
      getEntriesInRange(workspaceId, userId, windowStart, windowEnd),
      getPreviousEntries(
        workspaceId,
        userId,
        windowStart,
        notDone ? [notDone] : [],
      ),
      db
        .select(taskColumns)
        .from(taskTable)
        .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
        .leftJoin(teamTable, eq(taskTable.teamId, teamTable.id))
        .where(and(...unplannedConditions)),
      // Lo que vence dentro de la ventana, planificado o no: en Riuna el
      // vencimiento es un dato aparte del plan (ADR 040), asi que una tarea
      // planificada para otro dia sigue apareciendo aqui -con su
      // `plannedDate`, para que la tarjeta diga "planificada el vie"-.
      db
        .select({
          ...taskColumns,
          plannedDate: personalPlanEntryTable.plannedDate,
        })
        .from(taskTable)
        .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
        .leftJoin(teamTable, eq(taskTable.teamId, teamTable.id))
        .leftJoin(
          personalPlanEntryTable,
          and(
            eq(personalPlanEntryTable.taskId, taskTable.id),
            eq(personalPlanEntryTable.userId, userId),
          ),
        )
        .where(and(...deadlineConditions)),
      computeGhosts(workspaceId, userId, windowStart, windowEnd),
    ]);

  const loggedByTask = await loggedSecondsByTask([
    ...entryRows.map((row) => row.id),
    ...previousRows.map((row) => row.id),
  ]);

  const [entries, previous, unplanned, deadlines] = await Promise.all([
    decorateTasks(entryRows, projectColumns),
    decorateTasks(previousRows, projectColumns),
    decorateTasks(unplannedRows, projectColumns),
    decorateTasks(deadlineRows, projectColumns),
  ]);

  const withLogged = <T extends { id: string }>(rows: T[]) =>
    rows.map((row) => ({
      ...row,
      loggedSeconds: loggedByTask.get(row.id) ?? 0,
    }));

  return {
    entries: withLogged(entries),
    previous: withLogged(previous),
    unplanned,
    deadlines,
    ghosts,
    capacityByDay,
    fixedBlocksByDay,
    serverToday,
  };
}
