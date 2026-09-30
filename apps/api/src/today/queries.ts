import { and, eq, gt, isNull, or, type SQL } from "drizzle-orm";
import db from "../database";
import {
  personalPlanEntryTable,
  projectTable,
  taskTable,
  teamTable,
} from "../database/schema";
import { assignedCondition } from "../my-work/scope";
import { taskColumns } from "../planner/queries";
import { dueWindowCondition } from "../utils/due-window";

/**
 * Vencido o vence hoy, sin planificar hoy ni antes (ADR 046). El `LEFT JOIN`
 * a `personal_plan_entry` sin fecha basta para saberlo -es unica por
 * (userId, taskId)-, y lo necesitan tanto la lista de Hoy como su contador en
 * la barra lateral: repetir este `WHERE` fue lo que causo dos veces el mismo
 * escape entre espacios con esta tabla (ADR 046), asi que solo vive aqui.
 */
function urgentConditions(
  workspaceId: string,
  userId: string,
  todayStart: Date,
  now: Date,
  notDone: SQL | null,
) {
  return and(
    eq(projectTable.workspaceId, workspaceId),
    assignedCondition(userId),
    ...(notDone ? [notDone] : []),
    or(dueWindowCondition("overdue", now), dueWindowCondition("today", now)),
    or(
      isNull(personalPlanEntryTable.plannedDate),
      gt(personalPlanEntryTable.plannedDate, todayStart),
    ),
  );
}

/** La lista de Hoy: lo urgente con su tarea, proyecto y `plannedDate`. */
export function urgentTasksQuery(
  workspaceId: string,
  userId: string,
  todayStart: Date,
  now: Date,
  notDone: SQL | null,
) {
  return db
    .select({ ...taskColumns, plannedDate: personalPlanEntryTable.plannedDate })
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
    .where(urgentConditions(workspaceId, userId, todayStart, now, notDone));
}

/** El contador de la barra lateral: los mismos ids, sin decorar nada. */
export function urgentTaskIds(
  workspaceId: string,
  userId: string,
  todayStart: Date,
  now: Date,
  notDone: SQL | null,
) {
  return db
    .select({ id: taskTable.id })
    .from(taskTable)
    .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .leftJoin(
      personalPlanEntryTable,
      and(
        eq(personalPlanEntryTable.taskId, taskTable.id),
        eq(personalPlanEntryTable.userId, userId),
      ),
    )
    .where(urgentConditions(workspaceId, userId, todayStart, now, notDone));
}
