import { isSameDay } from "date-fns";
import { and, eq, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  personalPlanEntryTable,
  projectTable,
  taskTable,
} from "../../database/schema";
import { publishEvent } from "../../events";

/**
 * Sin `position` explicita: si la tarea ya estaba planeada y no cambia de
 * dia, conserva el sitio que tenia -da igual si esta llamada vino a tocar
 * solo `startMinute`-; si cambia de dia (o es nueva), va al final del dia de
 * destino. Es lo que hace falta para que arrastrar una tarea entre columnas
 * del Cronograma (`moveEntryDay`, que solo sabe de hora y dia, no de orden
 * del Planificador) no la mande siempre a la cabeza del dia -el 0 por
 * defecto de antes-. El Planificador en si (arrastrar y soltar en su propia
 * lista) sigue mandando `position` explicita, calculada contra los vecinos
 * reales, y nunca pasa por aqui.
 */
async function resolvePosition({
  userId,
  taskId,
  plannedDate,
}: {
  userId: string;
  taskId: string;
  plannedDate: Date;
}): Promise<number> {
  const [existing] = await db
    .select({
      plannedDate: personalPlanEntryTable.plannedDate,
      position: personalPlanEntryTable.position,
    })
    .from(personalPlanEntryTable)
    .where(
      and(
        eq(personalPlanEntryTable.userId, userId),
        eq(personalPlanEntryTable.taskId, taskId),
      ),
    );

  if (existing && isSameDay(existing.plannedDate, plannedDate)) {
    return existing.position;
  }

  const [row] = await db
    .select({
      max: sql<number | null>`max(${personalPlanEntryTable.position})`,
    })
    .from(personalPlanEntryTable)
    .where(
      and(
        eq(personalPlanEntryTable.userId, userId),
        eq(personalPlanEntryTable.plannedDate, plannedDate),
      ),
    );

  return (row?.max ?? -1) + 1;
}

/**
 * Planea o mueve una tarea a un dia. Nunca toca `task.due_date` (ADR 040):
 * ninguna columna de `task` se escribe aqui.
 */
export default async function setPlanEntry({
  workspaceId,
  userId,
  taskId,
  plannedDate,
  position,
  startMinute,
}: {
  workspaceId: string;
  userId: string;
  taskId: string;
  plannedDate: Date;
  /** Ausente: se calcula, ver `resolvePosition`. */
  position?: number;
  /**
   * Ausente: no se toca (mover en el Planificador no debe desanclar una hora
   * ya puesta desde el Cronograma). Presente (incluido `null`): se escribe.
   */
  startMinute?: number | null;
}) {
  const [task] = await db
    .select({ workspaceId: projectTable.workspaceId })
    .from(taskTable)
    .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .where(eq(taskTable.id, taskId))
    .limit(1);

  // El espacio de la tarea manda, no el de la query: sin esto, pertenecer a
  // un espacio bastaria para planificar una tarea de otro con solo saber su
  // id. Un 404 y no un 403, para no confirmar que la tarea existe en algun
  // sitio.
  if (!task || task.workspaceId !== workspaceId) {
    throw new HTTPException(404, { message: "Task not found" });
  }

  const resolvedPosition =
    position !== undefined
      ? position
      : await resolvePosition({ userId, taskId, plannedDate });

  const [entry] = await db
    .insert(personalPlanEntryTable)
    .values({
      workspaceId,
      userId,
      taskId,
      plannedDate,
      position: resolvedPosition,
      ...(startMinute !== undefined ? { startMinute } : {}),
    })
    .onConflictDoUpdate({
      target: [personalPlanEntryTable.userId, personalPlanEntryTable.taskId],
      set: {
        plannedDate,
        position: resolvedPosition,
        updatedAt: new Date(),
        ...(startMinute !== undefined ? { startMinute } : {}),
      },
    })
    .returning();

  if (!entry) {
    throw new HTTPException(500, { message: "Failed to save the plan entry" });
  }

  await publishEvent("personal-plan.changed", { userId });

  return entry;
}
