import { and, eq } from "drizzle-orm";
import db from "../../database";
import { taskTable, timeEntryTable } from "../../database/schema";
import { getLastEntry, getRunningEntry } from "../running";

/**
 * Lo que necesita el pie de la barra lateral: la entrada en marcha, si hay
 * alguna, con su tarea y lo ya registrado antes de este tramo -para poder
 * avisar cuando el total supere la estimacion-; y si no hay nada en marcha,
 * la ultima tarea sin terminar que se registro, para el "Reanudar" (el play
 * de la cabecera de super-productivity hace lo mismo).
 */
async function getRunningTimeEntry({
  userId,
  workspaceId,
}: {
  userId: string;
  workspaceId: string;
}) {
  const running = await getRunningEntry(userId);

  if (!running) {
    const last = await getLastEntry(userId, workspaceId);
    return { running: null, last: last ?? null };
  }

  const [task, closedEntries] = await Promise.all([
    db
      .select({
        id: taskTable.id,
        number: taskTable.number,
        title: taskTable.title,
        projectId: taskTable.projectId,
        estimate: taskTable.estimate,
      })
      .from(taskTable)
      .where(eq(taskTable.id, running.taskId))
      .limit(1)
      .then((rows) => rows[0]),
    db
      .select({ duration: timeEntryTable.duration })
      .from(timeEntryTable)
      .where(
        and(
          eq(timeEntryTable.taskId, running.taskId),
          eq(timeEntryTable.userId, userId),
        ),
      ),
  ]);

  // La entrada en marcha no tiene `duration` todavia -se calcula al
  // cerrarla-, asi que el total de la fila no la incluye: la suma es solo lo
  // ya cerrado.
  const loggedBeforeSeconds = closedEntries.reduce(
    (total, entry) => total + (entry.duration ?? 0),
    0,
  );

  return {
    running: {
      id: running.id,
      startTime: running.startTime,
      task,
      loggedBeforeSeconds,
    },
    last: null,
  };
}

export default getRunningTimeEntry;
