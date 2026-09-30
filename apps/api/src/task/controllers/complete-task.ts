import { and, asc, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { columnTable, taskTable } from "../../database/schema";
import { LEGACY_FINAL_STATUS } from "../../my-work/decorate";
import updateTaskStatus from "./update-task-status";

/**
 * La primera columna final o no final del proyecto, para no obligar a quien
 * marca "hecha" a saber como se llama esa columna en este proyecto -a veces
 * "Hecha", a veces "Cerrado"-. El respaldo al slug heredado `done` es el mismo
 * que usa `my-work/decorate.ts` para una instalacion sin ninguna columna
 * marcada final.
 */
async function findTargetColumn(projectId: string, done: boolean) {
  const marked = await db.query.columnTable.findFirst({
    where: and(
      eq(columnTable.projectId, projectId),
      eq(columnTable.isFinal, done),
    ),
    orderBy: asc(columnTable.position),
  });
  if (marked) return marked;

  if (done) {
    return db.query.columnTable.findFirst({
      where: and(
        eq(columnTable.projectId, projectId),
        eq(columnTable.slug, LEGACY_FINAL_STATUS),
      ),
    });
  }

  return db.query.columnTable.findFirst({
    where: eq(columnTable.projectId, projectId),
    orderBy: asc(columnTable.position),
  });
}

/**
 * La casilla de "hecha" de Hoy y el Planificador (ADR 046). Por dentro es
 * `updateTaskStatus`: la cascada al arbol, el evento y la parada del
 * cronometro de la tarea (ADR 044) salen de ahi, no de aqui.
 */
export default async function completeTask({
  id,
  done,
  currentUserId,
}: {
  id: string;
  done: boolean;
  currentUserId: string;
}) {
  const task = await db.query.taskTable.findFirst({
    where: eq(taskTable.id, id),
  });
  if (!task) {
    throw new HTTPException(404, { message: "Task not found" });
  }

  const column = await findTargetColumn(task.projectId, done);
  if (!column) {
    throw new HTTPException(404, {
      message: done
        ? "This project has no final column"
        : "This project has no non-final column",
    });
  }

  return updateTaskStatus({ id, status: column.slug, currentUserId });
}
