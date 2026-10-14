import { and, eq, isNull } from "drizzle-orm";
import db from "../database";
import { taskTable, timeEntryTable } from "../database/schema";
import { publishEvent, subscribeToEvent } from "../events";
import { refreshFormulasForTasks } from "../field/formula/refresh";
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
async function stopIfDone(taskId: string | undefined) {
  if (!taskId) return;

  const [task] = await db
    .select({ completedAt: taskTable.completedAt })
    .from(taskTable)
    .where(eq(taskTable.id, taskId))
    .limit(1);

  if (!task?.completedAt) return;

  const runningEntries = await db
    .select()
    .from(timeEntryTable)
    .where(
      and(eq(timeEntryTable.taskId, taskId), isNull(timeEntryTable.endTime)),
    );

  for (const entry of runningEntries) {
    if (!entry.userId) continue;

    const closed = await closeRunningEntry(db, entry.userId, new Date());
    if (closed) {
      await refreshFormulasForTasks([closed.taskId]);
      await publishEvent("time-entry.stopped", {
        timeEntryId: closed.id,
        taskId: closed.taskId,
        userId: entry.userId,
      });
    }
  }
}

subscribeToEvent<{ taskId: string }>("task.status_changed", async (data) => {
  await stopIfDone(data.taskId);
});

// `move-task.ts` puede aterrizar la tarea -o alguna de sus descendientes- en
// una columna final del destino, pero solo publica `task.moved`: repetir
// `task.status_changed` ahi duplicaria la entrada de actividad y la
// notificacion que ese evento ya dispara por su cuenta (`activity/index.ts`,
// `notification/index.ts`), asi que este suscriptor se engancha tambien a
// `task.moved` en vez de pedirle a `move-task.ts` que publique el otro
// evento. `stopIfDone` relee `completed_at` por su cuenta, sin fiarse de
// nada del payload salvo el id, asi que da igual quien lo dispare.
subscribeToEvent<{ taskId: string }>("task.moved", async (data) => {
  await stopIfDone(data.taskId);
});
