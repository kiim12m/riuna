import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { taskTable, timeEntryTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { refreshFormulasForTasks } from "../../field/formula/refresh";
import { isUniqueViolation } from "../../utils/is-unique-violation";
import { resolveDuration } from "../duration";
import type { FocusMode } from "../focus-mode";
import { closeRunningEntry, getRunningEntry } from "../running";

async function createTimeEntry({
  taskId,
  userId,
  description,
  startTime,
  endTime,
  focusMode = null,
}: {
  taskId: string;
  userId: string;
  description?: string;
  startTime: Date;
  endTime?: Date;
  /** Sesion de trabajo del modo foco (ADR 056); `null`, cronometro normal. */
  focusMode?: FocusMode | null;
}) {
  const duration = resolveDuration(startTime, endTime);

  const [task] = await db
    .select({
      userId: taskTable.userId,
      title: taskTable.title,
      completedAt: taskTable.completedAt,
    })
    .from(taskTable)
    .where(eq(taskTable.id, taskId));

  if (!task) {
    throw new HTTPException(404, { message: "Task not found" });
  }

  // Igual que `start-timer.ts` (ADR 044): una entrada en marcha no puede
  // nacer en una tarea ya terminada. Un registro manual, cerrado, si puede
  // -es rellenar el parte de una tarea que ya se termino-, asi que el
  // candado solo mira `!endTime`. Vive aqui y no solo en `start-timer.ts`
  // porque `POST /time-entry` sin `endTime` y el `create_time_entry` de MCP
  // llegan a esta funcion sin pasar por ahi.
  if (!endTime && task.completedAt) {
    throw new HTTPException(409, {
      message: "Cannot track time on a task that is already done",
    });
  }

  // Sin `endTime` esta entrada nace en marcha (ADR 044): cerrar lo que ya
  // corria y abrir la nueva tienen que pasar juntas, o el indice unico
  // rechazaria la segunda mientras la primera sigue abierta. Con `endTime` es
  // un registro manual y no toca nada mas -es el `POST` viejo, que sigue
  // sirviendo a MCP-.
  let createdTimeEntry: typeof timeEntryTable.$inferSelect | undefined;
  let closedTaskId: string | null = null;
  try {
    createdTimeEntry = await db.transaction(async (tx) => {
      if (!endTime) {
        const closed = await closeRunningEntry(tx, userId, startTime);
        closedTaskId = closed?.taskId ?? null;
      }

      const [inserted] = await tx
        .insert(timeEntryTable)
        .values({
          id: createId(),
          taskId,
          userId,
          description: description || "",
          startTime,
          endTime: endTime || null,
          duration,
          focusMode,
        })
        .returning();

      return inserted;
    });
  } catch (error) {
    // Dos "start" a la vez pueden leer las dos "nada en marcha" antes de que
    // ninguna confirme: la segunda transaccion choca con el indice unico
    // (ADR 044) al insertar. No es un error de verdad -es la misma carrera
    // que el `if (running.taskId === taskId)` de `start-timer.ts` ya
    // resuelve fuera de una transaccion-, asi que se devuelve lo que haya
    // quedado corriendo en vez de un 500 en bruto.
    if (!endTime && isUniqueViolation(error)) {
      const running = await getRunningEntry(userId);
      if (running) return running;
    }
    throw error;
  }

  if (!createdTimeEntry) {
    throw new HTTPException(500, {
      message: "Failed to create time entry",
    });
  }

  // Lo registrado de la rama es un dato de las formulas (ADR 090), tambien en
  // la tarea cuyo cronometro se acaba de cerrar.
  await refreshFormulasForTasks([createdTimeEntry.taskId, closedTaskId]);

  await publishEvent("time-entry.created", {
    timeEntryId: createdTimeEntry.id,
    taskId: createdTimeEntry.taskId,
    userId,
    type: "create",
    content: "started time tracking",
    taskOwnerId: task?.userId,
    taskTitle: task?.title,
  });

  return createdTimeEntry;
}

export default createTimeEntry;
