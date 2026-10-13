import { and, eq, like, or, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { taskRelationTable, taskTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { deleteS3Keys, getTaskAssetKeys } from "../../storage/cleanup-assets";
import { scheduleAfter } from "../schedule/reschedule";
import { subtreePattern, TASK_PATH_SEPARATOR } from "../tree";
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

  // Borrar un padre no borra su rama: las hijas suben a la abuela. Arrastrar
  // el subarbol seria irreversible y desproporcionado para un boton que dice
  // "borrar tarea"; dejarlas huerfanas perderia la estructura. Promoverlas
  // conserva las dos cosas.
  const deletedTask = await db.transaction(async (tx) => {
    await lockProjectTree(tx, task.projectId);

    // La rama se lee ya con el cerrojo tomado: leerla antes dejaba el
    // `UPDATE ... WHERE path LIKE` sin casar nada si el ancestro se habia
    // movido por debajo, mientras que el `UPDATE ... WHERE parent_id` si
    // casaba, dejando hijas con un `path` que contiene el id de una tarea ya
    // borrada. Ver `lockProjectTree`.
    const [node] = await tx
      .select({
        projectId: taskTable.projectId,
        parentId: taskTable.parentId,
        path: taskTable.path,
        depth: taskTable.depth,
      })
      .from(taskTable)
      .where(eq(taskTable.id, taskId))
      .limit(1);

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
