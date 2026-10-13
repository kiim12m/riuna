import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { columnTable, taskTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { scheduleAfter } from "../schedule/reschedule";
import { assertValidTaskStatus } from "../validate-task-fields";
import { cascadeStatusToSubtree } from "./cascade-status";

async function updateTaskStatus({
  id,
  status,
  currentUserId,
}: {
  id: string;
  status: string;
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

  await assertValidTaskStatus(status, existingTask.projectId);

  const column = await db.query.columnTable.findFirst({
    where: and(
      eq(columnTable.projectId, existingTask.projectId),
      eq(columnTable.slug, status),
    ),
  });

  const [updatedTask] = await db
    .update(taskTable)
    .set({ status, columnId: column?.id ?? null })
    .where(eq(taskTable.id, id))
    .returning();

  if (!updatedTask) {
    throw new HTTPException(500, {
      message: "Failed to update task status",
    });
  }

  const cascadedCount = await cascadeStatusToSubtree({
    task: updatedTask,
    status,
    currentUserId,
  });

  await publishEvent("task.status_changed", {
    taskId: updatedTask.id,
    projectId: updatedTask.projectId,
    userId: currentUserId,
    oldStatus: existingTask.status,
    newStatus: status,
    title: updatedTask.title,
    assigneeId: updatedTask.userId,
    type: "status_changed",
  });

  await publishEvent("task-relation.refresh", {
    projectId: updatedTask.projectId,
    userId: currentUserId,
  });

  // Archivar saca a la tarea —y a la rama que arrastre— de las fechas
  // automaticas de sus ancestros, y desarchivar la devuelve (ADR 083).
  if (existingTask.status === "archived" || status === "archived") {
    await scheduleAfter({
      projectId: updatedTask.projectId,
      taskIds: [updatedTask.id],
      actorId: currentUserId,
    });
  }

  return { ...updatedTask, cascadedCount };
}

export default updateTaskStatus;
