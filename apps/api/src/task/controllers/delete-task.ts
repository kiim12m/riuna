import { and, eq, like, or, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { taskRelationTable, taskTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { deleteS3Keys, getTaskAssetKeys } from "../../storage/cleanup-assets";
import { subtreePattern, TASK_PATH_SEPARATOR } from "../tree";
import getTask from "./get-task";

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

  // Borrar un padre no borra su rama: las hijas suben a la abuela. Arrastrar
  // el subarbol seria irreversible y desproporcionado para un boton que dice
  // "borrar tarea"; dejarlas huerfanas perderia la estructura. Promoverlas
  // conserva las dos cosas.
  const [node] = await db
    .select({
      projectId: taskTable.projectId,
      parentId: taskTable.parentId,
      path: taskTable.path,
      depth: taskTable.depth,
    })
    .from(taskTable)
    .where(eq(taskTable.id, taskId))
    .limit(1);

  const deletedTask = await db.transaction(async (tx) => {
    if (node) {
      const newParent = node.parentId
        ? await tx.query.taskTable.findFirst({
            where: eq(taskTable.id, node.parentId),
            columns: { id: true, path: true, depth: true },
          })
        : null;

      // Las hijas cuelgan de donde colgaba la tarea que se va, o de la raiz
      // del proyecto si no colgaba de nada.
      const newPrefix = newParent ? newParent.path : TASK_PATH_SEPARATOR;

      // Cada descendiente pierde un tramo del camino —el de la tarea que se
      // va— y sube un nivel.
      await tx
        .update(taskTable)
        .set({
          path: sql`${newPrefix} || substring(${taskTable.path} from ${node.path.length + 1}::int)`,
          depth: sql`${taskTable.depth} - 1`,
        })
        .where(
          and(
            eq(taskTable.projectId, node.projectId),
            like(taskTable.path, subtreePattern(node.path)),
            sql`${taskTable.id} <> ${taskId}`,
          ),
        );

      await tx
        .update(taskTable)
        .set({ parentId: node.parentId })
        .where(eq(taskTable.parentId, taskId));
    }

    const [removed] = await tx
      .delete(taskTable)
      .where(eq(taskTable.id, taskId))
      .returning();

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
