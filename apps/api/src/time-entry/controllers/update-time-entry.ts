import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { timeEntryTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { refreshFormulasForTasks } from "../../field/formula/refresh";
import { resolveDuration } from "../duration";

type UpdateTimeEntryParams = {
  timeEntryId: string;
  userId: string;
  startTime: Date;
  endTime?: Date;
  description?: string;
};

/**
 * Solo el dueno edita su entrada (ADR 044) -antes bastaba con el permiso
 * `task:update` del espacio, y eso dejaba corregir el registro de otra
 * persona-. Mismo patron que `deleteTimeEntry`: la condicion va en el propio
 * `WHERE`.
 */
async function updateTimeEntry(params: UpdateTimeEntryParams) {
  const { timeEntryId, userId, startTime, endTime, description } = params;

  const [existingTimeEntry] = await db
    .select()
    .from(timeEntryTable)
    .where(
      and(
        eq(timeEntryTable.id, timeEntryId),
        eq(timeEntryTable.userId, userId),
      ),
    );

  if (!existingTimeEntry) {
    throw new HTTPException(404, {
      message: "Time entry not found or you are not the owner",
    });
  }

  const effectiveEndTime = endTime ?? existingTimeEntry.endTime;

  const duration = resolveDuration(startTime, effectiveEndTime ?? undefined);

  const [updatedTimeEntry] = await db
    .update(timeEntryTable)
    .set({
      startTime,
      endTime: effectiveEndTime,
      duration,
      ...(description !== undefined && { description }),
    })
    .where(
      and(
        eq(timeEntryTable.id, timeEntryId),
        eq(timeEntryTable.userId, userId),
      ),
    )
    .returning();

  if (!updatedTimeEntry) {
    throw new HTTPException(500, {
      message: "Failed to update time entry",
    });
  }

  await refreshFormulasForTasks([updatedTimeEntry.taskId]);

  await publishEvent("time-entry.updated", {
    timeEntryId: updatedTimeEntry.id,
    taskId: updatedTimeEntry.taskId,
    userId,
  });

  return updatedTimeEntry;
}

export default updateTimeEntry;
