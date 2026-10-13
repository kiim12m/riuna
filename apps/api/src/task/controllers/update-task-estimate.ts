import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { taskTable } from "../../database/schema";
import { publishEvent } from "../../events";

// La estimacion se guarda en segundos, la misma unidad que `time_entry`, para
// que el agregado del subarbol compare estimado y registrado sin convertir.
async function updateTaskEstimate({
  id,
  estimate,
  currentUserId,
}: {
  id: string;
  estimate: number | null;
  currentUserId: string;
}) {
  if (estimate != null && (estimate < 0 || !Number.isInteger(estimate))) {
    throw new HTTPException(400, {
      message: "Estimate must be a whole number of seconds",
    });
  }

  if (estimate != null) {
    const [task] = await db
      .select({ isMilestone: taskTable.isMilestone })
      .from(taskTable)
      .where(eq(taskTable.id, id))
      .limit(1);
    // Un hito no se estima (ADR 082): no dura.
    if (task?.isMilestone) {
      throw new HTTPException(400, { message: "A milestone has no estimate" });
    }
  }

  const [updatedTask] = await db
    .update(taskTable)
    .set({ estimate })
    .where(eq(taskTable.id, id))
    .returning();

  if (!updatedTask) {
    throw new HTTPException(404, { message: "Task not found" });
  }

  await publishEvent("task.updated", {
    taskId: updatedTask.id,
    projectId: updatedTask.projectId,
    title: updatedTask.title,
    status: updatedTask.status,
    userId: currentUserId,
  });

  return updatedTask;
}

export default updateTaskEstimate;
