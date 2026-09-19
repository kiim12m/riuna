import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { taskTable, userTable } from "../../database/schema";
import { publishEvent } from "../../events";
import {
  assertAssignableUser,
  getProjectWorkspaceId,
} from "../../utils/assert-assignable-user";
import { syncPrimaryAssignee } from "./assignees";

async function updateTaskAssignee({
  id,
  userId,
  currentUserId,
}: {
  id: string;
  userId: string | null;
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

  const nextAssigneeId = userId?.trim() || null;
  if (existingTask.userId === nextAssigneeId) {
    return existingTask;
  }

  if (nextAssigneeId) {
    await assertAssignableUser(
      nextAssigneeId,
      await getProjectWorkspaceId(existingTask.projectId),
    );
  }

  // Cambiar el responsable principal por esta via tambien mueve el conjunto de
  // asignados, o las dos fuentes acabarian contradiciendose. Las dos
  // escrituras van en la misma transaccion, como pide `assignees.ts`.
  const updatedTask = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(taskTable)
      .set({ userId: nextAssigneeId })
      .where(eq(taskTable.id, id))
      .returning();

    if (!updated) {
      throw new HTTPException(500, {
        message: "Failed to update task assignee",
      });
    }

    await syncPrimaryAssignee(id, existingTask.userId, nextAssigneeId, tx);

    return updated;
  });

  const newAssigneeName = nextAssigneeId
    ? (
        await db
          .select({ name: userTable.name })
          .from(userTable)
          .where(eq(userTable.id, nextAssigneeId))
          .limit(1)
      )[0]?.name
    : undefined;

  if (!nextAssigneeId) {
    await publishEvent("task.unassigned", {
      taskId: updatedTask.id,
      projectId: updatedTask.projectId,
      userId: currentUserId,
      // Quien deja de tenerla. Sin este id, "Mi trabajo" no sabe a quien
      // avisar de que la fila ya no es suya y la tarea se le queda en la
      // pagina hasta el siguiente sondeo.
      previousAssigneeId: existingTask.userId,
      title: updatedTask.title,
      type: "unassigned",
    });

    return updatedTask;
  }

  await publishEvent("task.assignee_changed", {
    taskId: updatedTask.id,
    projectId: updatedTask.projectId,
    userId: currentUserId,
    oldAssignee: existingTask.userId,
    newAssignee: newAssigneeName,
    newAssigneeId: nextAssigneeId,
    title: updatedTask.title,
    type: "assignee_changed",
  });

  return updatedTask;
}

export default updateTaskAssignee;
