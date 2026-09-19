import { and, eq, isNull, ne } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { cycleTable, taskTable } from "../../database/schema";
import { publishEvent } from "../../events";

export type UnfinishedDestination = "backlog" | "cycle";

/**
 * Cierra un ciclo y resuelve lo que quedo dentro sin terminar.
 *
 * Cerrar es lo que hace que la velocidad signifique algo: a partir de aqui el
 * ciclo no cambia aunque alguien termine una tarea tarde. Por eso el estado
 * `closed` no se alcanza con el `PATCH` normal —esta operacion tiene que decidir
 * antes que pasa con lo pendiente— y por eso no hay vuelta atras.
 *
 * Todo va en una transaccion: mover las tareas y cerrar el ciclo tienen que
 * pasar juntos o no pasar, o quedaria un ciclo cerrado con tareas colgando de el
 * que nadie volveria a mirar.
 */
async function closeCycle({
  cycleId,
  unfinished,
  targetCycleId,
  currentUserId,
}: {
  cycleId: string;
  unfinished: UnfinishedDestination;
  targetCycleId?: string;
  currentUserId: string;
}) {
  const cycle = await db.query.cycleTable.findFirst({
    where: eq(cycleTable.id, cycleId),
  });

  if (!cycle) {
    throw new HTTPException(404, { message: "Cycle not found" });
  }

  if (cycle.status === "closed") {
    throw new HTTPException(400, { message: "This cycle is already closed" });
  }

  let target: typeof cycleTable.$inferSelect | null = null;

  if (unfinished === "cycle") {
    if (!targetCycleId) {
      throw new HTTPException(400, {
        message: "A target cycle is required to move the unfinished tasks",
      });
    }

    target =
      (await db.query.cycleTable.findFirst({
        where: eq(cycleTable.id, targetCycleId),
      })) ?? null;

    if (!target || target.projectId !== cycle.projectId) {
      throw new HTTPException(400, {
        message: "The target cycle must belong to the same project",
      });
    }

    if (target.id === cycle.id) {
      throw new HTTPException(400, {
        message: "The target cycle cannot be the cycle being closed",
      });
    }

    if (target.status === "closed") {
      throw new HTTPException(400, {
        message: "The target cycle is already closed",
      });
    }
  }

  const moved = await db.transaction(async (tx) => {
    // Solo lo que sigue sin terminar. Lo terminado se queda en el ciclo: es
    // exactamente lo que la velocidad mide.
    const pending = await tx
      .update(taskTable)
      .set({ cycleId: target ? target.id : null })
      .where(
        and(
          eq(taskTable.cycleId, cycleId),
          ne(taskTable.status, "archived"),
          isNull(taskTable.completedAt),
        ),
      )
      .returning({ id: taskTable.id });

    await tx
      .update(cycleTable)
      .set({ status: "closed", closedAt: new Date() })
      .where(eq(cycleTable.id, cycleId));

    return pending.length;
  });

  await publishEvent("cycle.changed", {
    projectId: cycle.projectId,
    cycleId: cycle.id,
    userId: currentUserId,
  });

  return {
    cycleId: cycle.id,
    movedTaskCount: moved,
    movedTo: target ? target.id : null,
  };
}

export default closeCycle;
