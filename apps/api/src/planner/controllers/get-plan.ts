import { and, asc, eq, gte, lte, type SQL, sql } from "drizzle-orm";
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
 * La capacidad de cada dia de la ventana, a partir de la jornada personal
 * (ADR 045): 0 si no es laborable, si no la jornada menos la comida y los
 * bloques `break` de ese dia -nunca la constante fija de 8 h que tenia la
 * ADR 040-.
 */
async function computeCapacityByDay(
  workspaceId: string,
  userId: string,
  windowStart: Date,
  windowEnd: Date,
): Promise<Record<string, number>> {
  const [schedule, { blocksByDay }] = await Promise.all([
    getWorkSchedule(userId),
    loadBlocksByDay(workspaceId, userId, windowStart, windowEnd),
  ]);

  const capacityByDay: Record<string, number> = {};
  for (const dayKey of dayKeysBetween(windowStart, windowEnd)) {
    const breakIntervals = (blocksByDay.get(dayKey) ?? [])
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
  }
  return capacityByDay;
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
  const [projectColumns, scopeConditions, capacityByDay] = await Promise.all([
    getWorkspaceColumns(workspaceId),
    workspaceTaskConditions({
      workspaceId,
      userId,
      scope: "assigned",
      filter: null,
      registry: {},
    }),
    computeCapacityByDay(workspaceId, userId, windowStart, windowEnd),
  ]);

  // El ambito "assigned" siempre resuelve a un predicado -nunca depende de
  // equipos-, pero el tipo lo comparte con "team" y hay que descartar el
  // `null` para TypeScript.
  if (!scopeConditions) {
    return {
      entries: [],
      unplanned: [],
      ghosts: [],
      capacityByDay,
      serverToday,
    };
  }

  const notDone = notDoneCondition(projectColumns);
  const unplannedConditions: SQL[] = [
    ...scopeConditions,
    notPlannedCondition(userId),
  ];
  if (notDone) unplannedConditions.push(notDone);

  const [entryRows, unplannedRows, ghosts] = await Promise.all([
    db
      .select({
        ...taskColumns,
        plannedDate: personalPlanEntryTable.plannedDate,
        position: personalPlanEntryTable.position,
      })
      .from(personalPlanEntryTable)
      .innerJoin(taskTable, eq(personalPlanEntryTable.taskId, taskTable.id))
      .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
      .leftJoin(teamTable, eq(taskTable.teamId, teamTable.id))
      .where(
        and(
          eq(personalPlanEntryTable.userId, userId),
          gte(personalPlanEntryTable.plannedDate, windowStart),
          lte(personalPlanEntryTable.plannedDate, windowEnd),
        ),
      )
      .orderBy(
        asc(personalPlanEntryTable.plannedDate),
        asc(personalPlanEntryTable.position),
      ),
    db
      .select(taskColumns)
      .from(taskTable)
      .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
      .leftJoin(teamTable, eq(taskTable.teamId, teamTable.id))
      .where(and(...unplannedConditions)),
    computeGhosts(workspaceId, userId, windowStart, windowEnd),
  ]);

  const [entries, unplanned] = await Promise.all([
    decorateTasks(entryRows, projectColumns),
    decorateTasks(unplannedRows, projectColumns),
  ]);

  return {
    entries,
    unplanned,
    ghosts,
    capacityByDay,
    serverToday,
  };
}
