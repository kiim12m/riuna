import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { columnTable, taskTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { deleteOrphanedAssets } from "../../storage/cleanup-assets";
import {
  assertAssignableUser,
  getProjectWorkspaceId,
} from "../../utils/assert-assignable-user";
import { assertValidTaskStatus } from "../validate-task-fields";
import { syncPrimaryAssignee } from "./assignees";
import { cascadeStatusToSubtree } from "./cascade-status";

async function updateTask(
  id: string,
  title: string,
  status: string,
  startDate: Date | undefined,
  dueDate: Date | undefined,
  projectId: string,
  description: string,
  priority: string,
  position: number,
  userId?: string,
  currentUserId?: string,
) {
  const [existingTask] = await db
    .select({
      id: taskTable.id,
      description: taskTable.description,
      status: taskTable.status,
      dueDate: taskTable.dueDate,
      projectId: taskTable.projectId,
      userId: taskTable.userId,
    })
    .from(taskTable)
    .where(eq(taskTable.id, id))
    .limit(1);

  if (!existingTask) {
    throw new HTTPException(404, {
      message: "Task not found",
    });
  }

  if (projectId !== existingTask.projectId) {
    throw new HTTPException(400, {
      message: "Use the task move endpoint to move tasks between projects",
    });
  }

  await assertValidTaskStatus(status, projectId);

  const normalizedUserId = userId?.trim() || undefined;

  if (normalizedUserId) {
    await assertAssignableUser(
      normalizedUserId,
      await getProjectWorkspaceId(projectId),
    );
  }

  const column = await db.query.columnTable.findFirst({
    where: and(
      eq(columnTable.projectId, projectId),
      eq(columnTable.slug, status),
    ),
  });

  // El conjunto de asignados se sincroniza dentro de la misma transaccion que
  // escribe `assignee_id`: si se hicieran por separado, un fallo entre las dos
  // dejaria la divergencia que `assignees.ts` existe para impedir.
  const [updatedTask] = await db.transaction(async (tx) => {
    const rows = await tx
      .update(taskTable)
      .set({
        title,
        status,
        columnId: column?.id ?? null,
        startDate: startDate || null,
        dueDate: dueDate || null,
        projectId,
        description,
        priority,
        position,
        userId: normalizedUserId ?? null,
      })
      .where(eq(taskTable.id, id))
      .returning();

    if (rows[0]) {
      await syncPrimaryAssignee(id, existingTask.userId, rows[0].userId, tx);
    }

    return rows;
  });

  if (!updatedTask) {
    throw new HTTPException(500, {
      message: "Failed to update task",
    });
  }

  if (existingTask.status !== status) {
    await cascadeStatusToSubtree({
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
  }

  // La edicion completa tambien mueve el vencimiento, y sin este evento ni los
  // avisos de quien observa (ADR 076) ni las automatizaciones se enteraban.
  if (
    (existingTask.dueDate?.getTime() ?? null) !==
    (updatedTask.dueDate?.getTime() ?? null)
  ) {
    await publishEvent("task.due_date_changed", {
      taskId: updatedTask.id,
      projectId: updatedTask.projectId,
      userId: currentUserId,
      oldDueDate: existingTask.dueDate,
      newDueDate: updatedTask.dueDate,
      title: updatedTask.title,
      type: "due_date_changed",
    });
  }

  await publishEvent("task.updated", {
    taskId: updatedTask.id,
    projectId: updatedTask.projectId,
    title: updatedTask.title,
    status: updatedTask.status,
    userId: currentUserId,
  });

  if (existingTask.description !== description) {
    deleteOrphanedAssets(existingTask.description, description, {
      taskId: id,
    }).catch(() => {});
  }

  return updatedTask;
}

export default updateTask;
