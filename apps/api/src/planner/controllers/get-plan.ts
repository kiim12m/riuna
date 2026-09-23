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
import { serverDayKey } from "../../utils/day-boundaries";
import { workspaceTaskConditions } from "../../view/workspace-task-query";
import { computeGhosts } from "../ghosts";

/** Jornada fija de 8 h por persona (ADR 040). No hay ajuste todavia. */
export const DAY_CAPACITY_SECONDS = 8 * 60 * 60;

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
  const [projectColumns, scopeConditions] = await Promise.all([
    getWorkspaceColumns(workspaceId),
    workspaceTaskConditions({
      workspaceId,
      userId,
      scope: "assigned",
      filter: null,
      registry: {},
    }),
  ]);

  // El ambito "assigned" siempre resuelve a un predicado -nunca depende de
  // equipos-, pero el tipo lo comparte con "team" y hay que descartar el
  // `null` para TypeScript.
  if (!scopeConditions) {
    return {
      entries: [],
      unplanned: [],
      ghosts: [],
      capacitySeconds: DAY_CAPACITY_SECONDS,
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
    capacitySeconds: DAY_CAPACITY_SECONDS,
    serverToday,
  };
}
