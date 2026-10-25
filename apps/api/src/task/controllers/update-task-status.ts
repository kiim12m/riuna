import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { columnTable, taskTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { refreshFormulasAfter } from "../../field/formula/refresh";
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

  const cascadedCount = await afterStatusChange({
    oldStatus: existingTask.status,
    task: updatedTask,
    currentUserId,
  });

  return { ...updatedTask, cascadedCount };
}

/**
 * Lo que sigue a cambiar el estado de una tarea, ya confirmado: la cascada por
 * su rama, los avisos y lo que mueve archivar. Tambien lo usa el arrastre
 * (`reorder-task.ts`), que cambia el estado dentro de su propia transaccion.
 */
export async function afterStatusChange({
  oldStatus,
  task,
  currentUserId,
}: {
  oldStatus: string;
  task: typeof taskTable.$inferSelect;
  currentUserId: string;
}) {
  const status = task.status;
  const cascadedCount = await cascadeStatusToSubtree({
    task,
    status,
    currentUserId,
  });

  await publishEvent("task.status_changed", {
    taskId: task.id,
    projectId: task.projectId,
    userId: currentUserId,
    oldStatus,
    newStatus: status,
    title: task.title,
    assigneeId: task.userId,
    type: "status_changed",
  });

  await publishEvent("task-relation.refresh", {
    projectId: task.projectId,
    userId: currentUserId,
  });

  // Archivar saca a la tarea —y a la rama que arrastre— de las fechas
  // automaticas de sus ancestros, y desarchivar la devuelve (ADR 083).
  if (oldStatus === "archived" || status === "archived") {
    await scheduleAfter({
      projectId: task.projectId,
      taskIds: [task.id],
      actorId: currentUserId,
    });
    // Lo archivado no suma en la rama (ADR 090, como `tree-aggregates`).
    await refreshFormulasAfter({
      projectId: task.projectId,
      taskIds: [task.id],
    });
  }

  return cascadedCount;
}

export default updateTaskStatus;
