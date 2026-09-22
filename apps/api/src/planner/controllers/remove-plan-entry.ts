import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { personalPlanEntryTable } from "../../database/schema";
import { publishEvent } from "../../events";

/**
 * Vuelve a "sin planificar". Acotado por `userId` de la sesion: no hace falta
 * verificar el espacio, porque nadie puede tocar la fila de otra persona con
 * solo saber el id de una tarea.
 */
export default async function removePlanEntry({
  userId,
  taskId,
}: {
  userId: string;
  taskId: string;
}) {
  const [deleted] = await db
    .delete(personalPlanEntryTable)
    .where(
      and(
        eq(personalPlanEntryTable.userId, userId),
        eq(personalPlanEntryTable.taskId, taskId),
      ),
    )
    .returning();

  if (!deleted) {
    throw new HTTPException(404, { message: "Plan entry not found" });
  }

  await publishEvent("personal-plan.changed", { userId });

  return deleted;
}
