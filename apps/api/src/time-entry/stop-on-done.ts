import { and, eq, isNull } from "drizzle-orm";
import db from "../database";
import { taskTable, timeEntryTable } from "../database/schema";
import { publishEvent, subscribeToEvent } from "../events";
import { closeRunningEntry } from "./running";

/**
 * Para el cronometro de una tarea en cuanto entra en una columna final
 * (ADR 044) -mismo comportamiento que el `autoSetNextTask$` de
 * super-productivity al marcar la tarea que se esta siguiendo como hecha-.
 *
 * `completed_at` ya lo mantiene el disparador `task_set_completed_at` por
 * cada uno de los nueve escritores de `status` del dominio (ADR 025):
 * releerlo aqui evita reimplementar que estado cuenta como final. Cierra
 * **todas** las entradas en marcha de esa tarea, no solo la de quien la
 * marco hecha -alguien puede estar siguiendola mientras otra persona la
 * cierra-.
 */
subscribeToEvent<{ taskId: string }>("task.status_changed", async (data) => {
  if (!data.taskId) return;

  const [task] = await db
    .select({ completedAt: taskTable.completedAt })
    .from(taskTable)
    .where(eq(taskTable.id, data.taskId))
    .limit(1);

  if (!task?.completedAt) return;

  const runningEntries = await db
    .select()
    .from(timeEntryTable)
    .where(
      and(
        eq(timeEntryTable.taskId, data.taskId),
        isNull(timeEntryTable.endTime),
      ),
    );

  for (const entry of runningEntries) {
    if (!entry.userId) continue;

    const closed = await closeRunningEntry(db, entry.userId, new Date());
    if (closed) {
      await publishEvent("time-entry.stopped", {
        timeEntryId: closed.id,
        taskId: closed.taskId,
        userId: entry.userId,
      });
    }
  }
});
