import { eq, inArray } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { taskTable, userTable } from "../../database/schema";
import { publishEvent } from "../../events";
import {
  filterAssignableUsers,
  getProjectWorkspaceId,
} from "../../utils/assert-assignable-user";
import { getAssigneeIds, replaceAssignees } from "./assignees";

async function updateTaskAssignees({
  id,
  userIds,
  currentUserId,
}: {
  id: string;
  userIds: string[];
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

  const requested = [...new Set(userIds.map((userId) => userId.trim()))].filter(
    Boolean,
  );

  if (requested.length > 0) {
    const workspaceId = await getProjectWorkspaceId(existingTask.projectId);
    const assignable = await filterAssignableUsers(requested, workspaceId);
    const rejected = requested.filter((userId) => !assignable.has(userId));

    if (rejected.length > 0) {
      throw new HTTPException(403, {
        message: "Assignee is not a member of this workspace",
      });
    }
  }

  // Quien ya estaba, para poder avisar solo a los que entran. Sin esto habria
  // que notificar al conjunto entero en cada cambio, y quitar a una persona
  // pingaria a las otras cuatro.
  const previous = new Set(await getAssigneeIds(id));

  await replaceAssignees(id, requested);

  // El primero de la lista queda como responsable principal en
  // `task.assignee_id`, que es lo que siguen leyendo las notificaciones, los
  // filtros heredados y las integraciones.
  const nextPrimary = requested[0] ?? null;

  const [updatedTask] = await db
    .update(taskTable)
    .set({ userId: nextPrimary })
    .where(eq(taskTable.id, id))
    .returning();

  if (!updatedTask) {
    throw new HTTPException(500, {
      message: "Failed to update task assignees",
    });
  }

  const assigneeIds = await getAssigneeIds(id);
  const names =
    assigneeIds.length > 0
      ? await db
          .select({ id: userTable.id, name: userTable.name })
          .from(userTable)
          .where(inArray(userTable.id, assigneeIds))
      : [];

  await publishEvent("task.assignees_changed", {
    taskId: updatedTask.id,
    projectId: updatedTask.projectId,
    userId: currentUserId,
    assigneeIds,
    addedIds: assigneeIds.filter((userId) => !previous.has(userId)),
    removedIds: [...previous].filter((userId) => !assigneeIds.includes(userId)),
    assigneeNames: names.map((user) => user.name),
    title: updatedTask.title,
    type: "assignees_changed",
  });

  return { ...updatedTask, assigneeIds };
}

export default updateTaskAssignees;
