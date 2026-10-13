import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { taskTable } from "../../database/schema";
import { publishEvent } from "../../events";

async function updateTaskDueDate({
  id,
  dueDate,
  currentUserId,
}: {
  id: string;
  dueDate: Date | null;
  currentUserId: string;
}) {
  const existingTask = await db.query.taskTable.findFirst({
    where: eq(taskTable.id, id),
  });

  if (!existingTask) {
    throw new HTTPException(404, {
      message: "Task not found",
    });
  }

  // Los avisos ya enviados se rearman solos al cambiar la fecha: lo hace el
  // disparador `task_rearm_due_reminders` (ADR 050), para todos los caminos
  // que escriben `due_date`, no solo este.
  // Un hito tiene una sola fecha: mover el vencimiento mueve tambien el
  // inicio (ADR 082).
  const [updatedTask] = await db
    .update(taskTable)
    .set(
      existingTask.isMilestone
        ? { dueDate: dueDate || null, startDate: dueDate || null }
        : { dueDate: dueDate || null },
    )
    .where(eq(taskTable.id, id))
    .returning();

  if (!updatedTask) {
    throw new HTTPException(500, {
      message: "Failed to update task due date",
    });
  }

  await publishEvent("task.due_date_changed", {
    taskId: updatedTask.id,
    projectId: updatedTask.projectId,
    userId: currentUserId,
    oldDueDate: existingTask.dueDate,
    newDueDate: dueDate,
    title: updatedTask.title,
    type: "due_date_changed",
  });

  return updatedTask;
}

export default updateTaskDueDate;
