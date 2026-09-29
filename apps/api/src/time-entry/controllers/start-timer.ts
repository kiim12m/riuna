import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { taskTable } from "../../database/schema";
import { getRunningEntry } from "../running";
import createTimeEntry from "./create-time-entry";

/**
 * Arranca el cronometro en una tarea. Un solo cronometro por persona
 * (ADR 044): si ya corre otra, se cierra sola.
 *
 * Idempotente si ya esta corriendo justo esa tarea -pulsar play dos veces
 * seguidas en el pie de la barra no debe crear una segunda entrada-.
 */
async function startTimer({
  taskId,
  userId,
}: {
  taskId: string;
  userId: string;
}) {
  const running = await getRunningEntry(userId);
  if (running && running.taskId === taskId) {
    return running;
  }

  const [task] = await db
    .select({ completedAt: taskTable.completedAt })
    .from(taskTable)
    .where(eq(taskTable.id, taskId))
    .limit(1);

  if (!task) {
    throw new HTTPException(404, { message: "Task not found" });
  }

  if (task.completedAt) {
    throw new HTTPException(409, {
      message: "Cannot track time on a task that is already done",
    });
  }

  // Sin `endTime`: nace en marcha, y `createTimeEntry` cierra lo que ya
  // corria (en otra tarea, por el `if` de arriba) antes de abrir esta.
  return createTimeEntry({ taskId, userId, startTime: new Date() });
}

export default startTimer;
