import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { personalPlanEntryTable } from "../../database/schema";
import { publishEvent } from "../../events";

/**
 * Vuelve a "sin planificar". Acotado por `userId` de la sesion: eso basta
 * frente a otra persona, que no puede tocar esta fila con solo saber el id de
 * la tarea. No basta frente a otro espacio de la misma persona, porque una
 * entrada de plan es unica por `(userId, taskId)` sin importar en que espacio
 * se creo — hay que filtrar tambien por `workspaceId`.
 */
export default async function removePlanEntry({
  userId,
  workspaceId,
  taskId,
}: {
  userId: string;
  workspaceId: string;
  taskId: string;
}) {
  const [deleted] = await db
    .delete(personalPlanEntryTable)
    .where(
      and(
        eq(personalPlanEntryTable.userId, userId),
        eq(personalPlanEntryTable.taskId, taskId),
        eq(personalPlanEntryTable.workspaceId, workspaceId),
      ),
    )
    .returning();

  if (!deleted) {
    throw new HTTPException(404, { message: "Plan entry not found" });
  }

  await publishEvent("personal-plan.changed", { userId });

  return deleted;
}
