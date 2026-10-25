import { and, eq, like, sql } from "drizzle-orm";
import type db from "../../database";
import { taskTable } from "../../database/schema";
import { subtreePattern, TASK_PATH_SEPARATOR } from "../tree";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Borra tareas subiendo sus hijas a donde colgaba cada una, o a la raiz del
 * proyecto. Lo usan el borrado de una tarea y el borrado en lote, que antes
 * dejaba a la FK poner `parent_id` a NULL con el `path` y el `depth` viejos.
 *
 * Borrar un padre no borra su rama: arrastrar el subarbol seria irreversible y
 * desproporcionado para un boton que dice "borrar tarea"; dejar las hijas
 * huerfanas perderia la estructura. Promoverlas conserva las dos cosas.
 *
 * Quien llama tiene el cerrojo de cada proyecto (`lockProjectTree`). Cada tarea
 * se relee justo antes de borrarla: si en el mismo lote va su madre, su `path`
 * ya cambio al promoverla. Devuelve las filas borradas, con el `parent_id` que
 * tenian al irse.
 */
export async function deleteTasksPromotingChildren(tx: Tx, taskIds: string[]) {
  const removed: (typeof taskTable.$inferSelect)[] = [];

  for (const taskId of taskIds) {
    const [node] = await tx
      .select({
        projectId: taskTable.projectId,
        parentId: taskTable.parentId,
        path: taskTable.path,
      })
      .from(taskTable)
      .where(eq(taskTable.id, taskId))
      .limit(1);
    if (!node) continue;

    const newParent = node.parentId
      ? await tx.query.taskTable.findFirst({
          where: eq(taskTable.id, node.parentId),
          columns: { path: true },
        })
      : null;
    const newPrefix = newParent ? newParent.path : TASK_PATH_SEPARATOR;

    // Cada descendiente pierde un tramo del camino —el de la tarea que se va—
    // y sube un nivel.
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

    const [row] = await tx
      .delete(taskTable)
      .where(eq(taskTable.id, taskId))
      .returning();
    if (row) removed.push(row);
  }

  return removed;
}
