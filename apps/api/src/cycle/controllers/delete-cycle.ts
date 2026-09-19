import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { cycleTable } from "../../database/schema";
import { publishEvent } from "../../events";

/**
 * Borra un ciclo. Sus tareas **no** se borran: `task.cycle_id` es
 * `ON DELETE SET NULL`, asi que vuelven al backlog. Una tarea sobrevive a su
 * sprint.
 */
async function deleteCycle(cycleId: string, currentUserId: string) {
  const [deleted] = await db
    .delete(cycleTable)
    .where(eq(cycleTable.id, cycleId))
    .returning();

  if (!deleted) {
    throw new HTTPException(404, { message: "Cycle not found" });
  }

  await publishEvent("cycle.changed", {
    projectId: deleted.projectId,
    cycleId: deleted.id,
    userId: currentUserId,
  });

  return deleted;
}

export default deleteCycle;
