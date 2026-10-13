import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { taskTable } from "../../database/schema";
import type { FocusMode } from "../focus-mode";
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
  focusMode = null,
}: {
  taskId: string;
  userId: string;
  /** Sesion de trabajo del modo foco (ADR 056). */
  focusMode?: FocusMode | null;
}) {
  const running = await getRunningEntry(userId);
  // Misma tarea y mismo modo: no hay nada que cambiar. Si cambia el modo
  // -empezar un pomodoro sobre un cronometro normal-, se abre otra entrada:
  // la sesion de foco empieza ahi, no cuando empezo el cronometro.
  if (
    running &&
    running.taskId === taskId &&
    (running.focusMode ?? null) === focusMode
  ) {
    return running;
  }

  const [task] = await db
    .select({
      completedAt: taskTable.completedAt,
      isMilestone: taskTable.isMilestone,
    })
    .from(taskTable)
    .where(eq(taskTable.id, taskId))
    .limit(1);

  if (!task) {
    throw new HTTPException(404, { message: "Task not found" });
  }

  if (task.isMilestone) {
    throw new HTTPException(409, {
      message: "A milestone does not take time: it has no timer",
    });
  }

  if (task.completedAt) {
    throw new HTTPException(409, {
      message: "Cannot track time on a task that is already done",
    });
  }

  // Sin `endTime`: nace en marcha, y `createTimeEntry` cierra lo que ya
  // corria (en otra tarea, por el `if` de arriba) antes de abrir esta.
  return createTimeEntry({
    taskId,
    userId,
    startTime: new Date(),
    focusMode,
  });
}

export default startTimer;
