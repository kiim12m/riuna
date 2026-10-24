import { eq, or } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { taskRelationTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { refreshFormulasAfter } from "../../field/formula/refresh";
import { deleteS3Keys, getTaskAssetKeys } from "../../storage/cleanup-assets";
import { scheduleAfter } from "../schedule/reschedule";
import { deleteTasksPromotingChildren } from "./delete-tasks-promoting-children";
import getTask from "./get-task";
import { lockProjectTree } from "./lock-project-tree";

async function deleteTask(taskId: string, currentUserId: string) {
  const task = await getTask(taskId);

  const relations = await db
    .select()
    .from(taskRelationTable)
    .where(
      or(
        eq(taskRelationTable.sourceTaskId, taskId),
        eq(taskRelationTable.targetTaskId, taskId),
      ),
    )
    .execute();

  const assetKeys = await getTaskAssetKeys(taskId);

  const deletedTask = await db.transaction(async (tx) => {
    await lockProjectTree(tx, task.projectId);
    // La rama se lee ya con el cerrojo tomado (ver `lockProjectTree`).
    const [removed] = await deleteTasksPromotingChildren(tx, [taskId]);
    return removed;
  });

  if (!deletedTask) {
    throw new HTTPException(404, {
      message: "Task not found",
    });
  }

  await publishEvent("task.deleted", {
    taskId: task.id,
    projectId: task.projectId,
    userId: currentUserId,
    title: task.title,
    // Quien la tenia. La fila ya no existe, asi que este es el ultimo momento
    // en que se puede saber a quien hay que refrescarle "Mi trabajo".
    assigneeIds: task.assignees.map((assignee) => assignee.id),
    teamId: task.teamId,
  });

  // Sin ella, la rama de su padre puede encoger (ADR 083).
  await scheduleAfter({
    projectId: task.projectId,
    taskIds: [deletedTask.parentId],
    actorId: currentUserId,
    origin: task.id,
  });
  await refreshFormulasAfter({
    projectId: task.projectId,
    taskIds: [deletedTask.parentId],
  });

  for (const relation of relations) {
    await publishEvent("task-relation.deleted", {
      projectId: task.projectId,
      userId: currentUserId,
      taskId: taskId,
      sourceTaskId: relation.sourceTaskId,
      targetTaskId: relation.targetTaskId,
    });
  }

  // Fire-and-forget S3 cleanup after successful DB delete
  if (assetKeys.length > 0) {
    deleteS3Keys(assetKeys).catch(() => {});
  }

  return task;
}

export default deleteTask;
