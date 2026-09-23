import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  personalPlanEntryTable,
  projectTable,
  taskTable,
} from "../../database/schema";
import { publishEvent } from "../../events";

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
  position: number;
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

  const [entry] = await db
    .insert(personalPlanEntryTable)
    .values({
      workspaceId,
      userId,
      taskId,
      plannedDate,
      position,
      ...(startMinute !== undefined ? { startMinute } : {}),
    })
    .onConflictDoUpdate({
      target: [personalPlanEntryTable.userId, personalPlanEntryTable.taskId],
      set: {
        plannedDate,
        position,
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
