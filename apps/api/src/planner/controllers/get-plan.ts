import {
  and,
  asc,
  between,
  eq,
  gte,
  inArray,
  lt,
  lte,
  type SQL,
  sql,
} from "drizzle-orm";
import db from "../../database";
import {
  personalPlanEntryTable,
  projectTable,
  taskTable,
  teamTable,
  timeEntryTable,
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
import { dayCapacitySeconds } from "../../work-schedule/day-capacity";
import { getWorkSchedule } from "../../work-schedule/get-work-schedule";
import { computeGhosts } from "../ghosts";

const taskColumns = {
  id: taskTable.id,
  number: taskTable.number,
  title: taskTable.title,
  status: taskTable.status,
  priority: taskTable.priority,
  estimate: taskTable.estimate,
  dueDate: taskTable.dueDate,
  projectId: taskTable.projectId,
  projectName: projectTable.name,
  projectSlug: projectTable.slug,
  projectIcon: projectTable.icon,
  teamId: taskTable.teamId,
  teamName: teamTable.name,
};

/** Ninguna fila en `personal_plan_entry`, sin importar la fecha (ADR 040). */
function notPlannedCondition(userId: string) {
  return sql`NOT EXISTS (
    SELECT 1 FROM ${personalPlanEntryTable}
    WHERE ${personalPlanEntryTable.userId} = ${userId}
    AND ${personalPlanEntryTable.taskId} = ${taskTable.id}
  )`;
}

/**
 * Lo registrado por tarea, sumando solo entradas cerradas -igual que
 * `task/tree-aggregates.ts`-: la entrada en marcha no cuenta aqui su
 * transcurrido en vivo, que solo existe una vez por persona (ADR 044) y el
 * Planificador no repinta cada segundo.
 */
async function loggedSecondsByTask(
  taskIds: string[],
): Promise<Map<string, number>> {
  if (taskIds.length === 0) return new Map();

  const rows = await db
    .select({
      taskId: timeEntryTable.taskId,
      duration: timeEntryTable.duration,
    })
    .from(timeEntryTable)
    .where(inArray(timeEntryTable.taskId, taskIds));

  const totals = new Map<string, number>();
  for (const row of rows) {
    totals.set(row.taskId, (totals.get(row.taskId) ?? 0) + (row.duration ?? 0));
  }
  return totals;
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
    const breakIntervals = dayBlocks
      .filter((block) => block.kind === "break")
      .map((block) => ({
        startMinute: block.startMinute,
        endMinute: block.endMinute,
      }));
    capacityByDay[dayKey] = dayCapacitySeconds(
      schedule,
      parseServerDay(dayKey, "day"),
      breakIntervals,
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

  const previousConditions: SQL[] = [
    eq(personalPlanEntryTable.userId, userId),
    eq(personalPlanEntryTable.workspaceId, workspaceId),
    lt(personalPlanEntryTable.plannedDate, windowStart),
  ];
  if (notDone) previousConditions.push(notDone);

  const deadlineConditions: SQL[] = [
    eq(projectTable.workspaceId, workspaceId),
    assignedCondition(userId),
    between(taskTable.dueDate, windowStart, windowEnd),
  ];
  if (notDone) deadlineConditions.push(notDone);

  const entryColumns = {
    ...taskColumns,
    plannedDate: personalPlanEntryTable.plannedDate,
    position: personalPlanEntryTable.position,
    startMinute: personalPlanEntryTable.startMinute,
  };

  const [entryRows, previousRows, unplannedRows, deadlineRows, ghosts] =
    await Promise.all([
      db
        .select(entryColumns)
        .from(personalPlanEntryTable)
        .innerJoin(taskTable, eq(personalPlanEntryTable.taskId, taskTable.id))
        .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
        .leftJoin(teamTable, eq(taskTable.teamId, teamTable.id))
        .where(
          and(
            eq(personalPlanEntryTable.userId, userId),
            // Sin esto, una entrada planeada desde otro espacio del mismo
            // usuario se colaba aqui en una fecha compartida -mismo fallo
            // que ya corrigio la ADR 041 en `get-schedule.ts`, sin aplicar
            // todavia aqui-.
            eq(personalPlanEntryTable.workspaceId, workspaceId),
            gte(personalPlanEntryTable.plannedDate, windowStart),
            lte(personalPlanEntryTable.plannedDate, windowEnd),
          ),
        )
        .orderBy(
          asc(personalPlanEntryTable.plannedDate),
          asc(personalPlanEntryTable.position),
        ),
      // "De dias anteriores" (super-productivity): planificadas antes de la
      // ventana y todavia sin terminar. Sin limite de dias hacia atras -a
      // proposito, declarado-: en la practica nadie deja de volver al
      // Planificador durante meses.
      db
        .select(entryColumns)
        .from(personalPlanEntryTable)
        .innerJoin(taskTable, eq(personalPlanEntryTable.taskId, taskTable.id))
        .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
        .leftJoin(teamTable, eq(taskTable.teamId, teamTable.id))
        .where(and(...previousConditions))
        .orderBy(asc(personalPlanEntryTable.plannedDate)),
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
