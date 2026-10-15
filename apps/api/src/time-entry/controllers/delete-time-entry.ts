import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { timeEntryTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { refreshFormulasForTasks } from "../../field/formula/refresh";

/**
 * Borra una entrada, y solo si es propia -mismo patron que
 * `updateComment`/`deleteComment`: la condicion de dueno va dentro del propio
 * `WHERE`, asi que la entrada de otra persona da 404 y no revela que existe.
 */
async function deleteTimeEntry(userId: string, id: string) {
  const [deleted] = await db
    .delete(timeEntryTable)
    .where(and(eq(timeEntryTable.id, id), eq(timeEntryTable.userId, userId)))
    .returning();

  if (!deleted) {
    throw new HTTPException(404, {
      message: "Time entry not found or you are not the owner",
    });
  }

  await refreshFormulasForTasks([deleted.taskId]);

  await publishEvent("time-entry.deleted", {
    timeEntryId: deleted.id,
    taskId: deleted.taskId,
    userId,
  });

  return deleted;
}

export default deleteTimeEntry;
