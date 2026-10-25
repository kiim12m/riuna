import { and, asc, eq, ne, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { columnTable, taskTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { assertValidTaskStatus } from "../validate-task-fields";
import { lockProjectTree } from "./lock-project-tree";
import { afterStatusChange } from "./update-task-status";

/**
 * Coloca una tarea en una columna —o en el backlog o el archivo— al lado de
 * una vecina, y renumera esa columna en una sola sentencia.
 *
 * Arrastrar mandaba un PUT completo por cada tarea de la columna, con la foto
 * que tenia el navegador, y pisaba lo que otra persona hubiera editado en las
 * vecinas. Aqui solo se mueve la arrastrada, y de las demas solo cambia
 * `position`.
 *
 * Se recibe la vecina y no la lista que ve el navegador: con un filtro puesto
 * esa lista es parte de la columna, y renumerarla pisaria el sitio de las
 * tareas ocultas. Las demas conservan su orden relativo. Si la vecina ya no
 * esta en la columna, se prueba con la otra, y si tampoco, al final.
 */
async function reorderTask({
  id,
  status,
  afterId,
  beforeId,
  currentUserId,
}: {
  id: string;
  status: string;
  afterId?: string | null;
  beforeId?: string | null;
  currentUserId: string;
}) {
  const existingTask = await db.query.taskTable.findFirst({
    where: eq(taskTable.id, id),
  });

  if (!existingTask) {
    throw new HTTPException(404, { message: "Task not found" });
  }

  const { projectId } = existingTask;
  await assertValidTaskStatus(status, projectId);
  const statusChanged = existingTask.status !== status;

  const column = statusChanged
    ? await db.query.columnTable.findFirst({
        where: and(
          eq(columnTable.projectId, projectId),
          eq(columnTable.slug, status),
        ),
      })
    : undefined;

  const updatedTask = await db.transaction(async (tx) => {
    await lockProjectTree(tx, projectId);

    if (statusChanged) {
      await tx
        .update(taskTable)
        .set({ status, columnId: column?.id ?? null })
        .where(eq(taskTable.id, id));
    }

    // El mismo orden que `get-tasks`: el desempate por id hace que lo que ve
    // el navegador y lo que se renumera coincidan aunque haya posiciones
    // repetidas.
    const siblings = await tx
      .select({ id: taskTable.id })
      .from(taskTable)
      .where(
        and(
          eq(taskTable.projectId, projectId),
          eq(taskTable.status, status),
          ne(taskTable.id, id),
        ),
      )
      .orderBy(asc(taskTable.position), asc(taskTable.id));

    const ids = siblings.map((sibling) => sibling.id);
    const afterIndex = afterId ? ids.indexOf(afterId) : -1;
    const beforeIndex = beforeId ? ids.indexOf(beforeId) : -1;
    const index =
      afterIndex >= 0
        ? afterIndex + 1
        : beforeIndex >= 0
          ? beforeIndex
          : ids.length;
    ids.splice(index, 0, id);

    // Solo se escriben las filas cuya posicion cambia.
    await tx.execute(sql`
      UPDATE "task" AS t
      SET "position" = (v.ordinality - 1)::int
      FROM unnest(${sql.param(ids)}::text[]) WITH ORDINALITY AS v(id, ordinality)
      WHERE t."id" = v.id
        AND t."position" IS DISTINCT FROM (v.ordinality - 1)::int
    `);

    return tx.query.taskTable.findFirst({ where: eq(taskTable.id, id) });
  });

  if (!updatedTask) {
    throw new HTTPException(404, { message: "Task not found" });
  }

  if (statusChanged) {
    await afterStatusChange({
      oldStatus: existingTask.status,
      task: updatedTask,
      currentUserId,
    });
  }

  // Un solo aviso para los demas navegadores, que vuelven a pedir la lista.
  await publishEvent("task.updated", {
    taskId: updatedTask.id,
    projectId,
    title: updatedTask.title,
    status: updatedTask.status,
    userId: currentUserId,
  });

  return updatedTask;
}

export default reorderTask;
