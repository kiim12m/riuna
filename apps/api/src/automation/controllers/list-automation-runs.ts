import { and, desc, eq, sql } from "drizzle-orm";
import db from "../../database";
import { automationRunTable, taskTable } from "../../database/schema";

export const DEFAULT_RUNS_PAGE = 50;
export const MAX_RUNS_PAGE = 100;

/**
 * El historial de una regla, de lo mas reciente a lo mas antiguo, con el mismo
 * cursor que las notificaciones: milisegundo e id, para no saltar ni repetir
 * las ejecuciones de una rafaga (una importacion grande, un movimiento en
 * bloque).
 */
export async function listAutomationRuns(
  automationId: string,
  {
    limit,
    before,
    beforeId,
  }: { limit?: number; before?: Date; beforeId?: string } = {},
) {
  const startedMs = sql`date_trunc('milliseconds', ${automationRunTable.startedAt})`;
  const conditions = [eq(automationRunTable.automationId, automationId)];
  if (before) {
    // `started_at` no lleva zona y se guarda en UTC: el instante se compara
    // como hora de pared UTC.
    const cursor = sql`${before.toISOString()}::timestamp`;
    conditions.push(
      beforeId
        ? sql`(${startedMs}, ${automationRunTable.id}) < (${cursor}, ${beforeId})`
        : sql`${startedMs} < ${cursor}`,
    );
  }

  return db
    .select({
      id: automationRunTable.id,
      taskId: automationRunTable.taskId,
      taskTitle: taskTable.title,
      taskNumber: taskTable.number,
      triggerType: automationRunTable.triggerType,
      status: automationRunTable.status,
      detail: automationRunTable.detail,
      startedAt: automationRunTable.startedAt,
      durationMs: automationRunTable.durationMs,
    })
    .from(automationRunTable)
    .leftJoin(taskTable, eq(automationRunTable.taskId, taskTable.id))
    .where(and(...conditions))
    .orderBy(desc(startedMs), desc(automationRunTable.id))
    .limit(Math.min(Math.max(limit ?? DEFAULT_RUNS_PAGE, 1), MAX_RUNS_PAGE));
}
