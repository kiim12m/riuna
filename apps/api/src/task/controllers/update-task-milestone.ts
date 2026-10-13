import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { taskTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { scheduleAfter } from "../schedule/reschedule";

/**
 * Marca o desmarca una tarea como hito (ADR 082). Un hito tiene una sola
 * fecha —el inicio pasa a ser el vencimiento—, ni estimacion ni subtareas:
 * es un punto en el tiempo, no un trabajo que dure.
 */
async function updateTaskMilestone({
  id,
  isMilestone,
  currentUserId,
}: {
  id: string;
  isMilestone: boolean;
  currentUserId: string;
}) {
  const [task] = await db
    .select()
    .from(taskTable)
    .where(eq(taskTable.id, id))
    .limit(1);

  if (!task) {
    throw new HTTPException(404, { message: "Task not found" });
  }
  if (task.isMilestone === isMilestone) return task;

  if (isMilestone) {
    const [child] = await db
      .select({ id: taskTable.id })
      .from(taskTable)
      .where(
        and(
          eq(taskTable.projectId, task.projectId),
          eq(taskTable.parentId, id),
        ),
      )
      .limit(1);
    if (child) {
      throw new HTTPException(400, {
        message: "A task with subtasks cannot be a milestone",
      });
    }
  }

  // Del tramo que tuviera se queda con el final: es lo que se entrega.
  const day = task.dueDate ?? task.startDate;
  const [updated] = await db
    .update(taskTable)
    .set(
      isMilestone
        ? { isMilestone, startDate: day, dueDate: day, estimate: null }
        : { isMilestone },
    )
    .where(eq(taskTable.id, id))
    .returning();

  if (!updated) {
    throw new HTTPException(500, { message: "Failed to update the task" });
  }

  await publishEvent("task.milestone_changed", {
    taskId: id,
    projectId: updated.projectId,
    userId: currentUserId,
    isMilestone,
    type: "milestone_changed",
  });

  if (
    (task.dueDate?.getTime() ?? null) !== (updated.dueDate?.getTime() ?? null)
  ) {
    await publishEvent("task.due_date_changed", {
      taskId: id,
      projectId: updated.projectId,
      userId: currentUserId,
      oldDueDate: task.dueDate,
      newDueDate: updated.dueDate,
      title: updated.title,
      type: "due_date_changed",
    });
  }

  await scheduleAfter({
    projectId: updated.projectId,
    taskIds: [id],
    actorId: currentUserId,
  });

  await publishEvent("task.updated", {
    taskId: id,
    projectId: updated.projectId,
    title: updated.title,
    status: updated.status,
    userId: currentUserId,
  });

  return updated;
}

export default updateTaskMilestone;
