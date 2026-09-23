import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { personalPlanEntryTable } from "../../database/schema";
import { publishEvent } from "../../events";

/**
 * Ancla o libera la hora de una entrada ya planeada (ADR 041). Requiere que
 * la tarea ya tenga fila en `personal_plan_entry` — el Cronograma decide
 * *cuando* dentro de un dia que el Planificador ya decidio, nunca *que dia*.
 */
export default async function setEntryTime({
  userId,
  workspaceId,
  taskId,
  startMinute,
}: {
  userId: string;
  workspaceId: string;
  taskId: string;
  startMinute: number | null;
}) {
  const [entry] = await db
    .update(personalPlanEntryTable)
    .set({ startMinute, updatedAt: new Date() })
    .where(
      and(
        eq(personalPlanEntryTable.userId, userId),
        eq(personalPlanEntryTable.taskId, taskId),
        eq(personalPlanEntryTable.workspaceId, workspaceId),
      ),
    )
    .returning();

  if (!entry) {
    throw new HTTPException(404, { message: "Plan entry not found" });
  }

  await publishEvent("schedule.changed", { userId });

  return entry;
}
