import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { cycleTable, taskTable } from "../../database/schema";
import { publishEvent } from "../../events";

/**
 * Mete una tarea en un ciclo, o la saca.
 *
 * Es editar la tarea, no el proyecto, asi que va con `task:update` —el mismo
 * criterio que colgar una tarea de una epica—.
 */
async function updateTaskCycle({
  taskId,
  cycleId,
  currentUserId,
}: {
  taskId: string;
  cycleId: string | null;
  currentUserId: string;
}) {
  const task = await db.query.taskTable.findFirst({
    where: eq(taskTable.id, taskId),
  });

  if (!task) {
    throw new HTTPException(404, { message: "Task not found" });
  }

  const nextCycleId = cycleId?.trim() || null;

  if (nextCycleId) {
    const cycle = await db.query.cycleTable.findFirst({
      where: eq(cycleTable.id, nextCycleId),
    });

    // El ciclo cuelga del proyecto, asi que aceptar uno de otro proyecto
    // dejaria una tarea en un sprint que su tablero no muestra.
    if (!cycle || cycle.projectId !== task.projectId) {
      throw new HTTPException(400, {
        message: "The cycle must belong to the same project as the task",
      });
    }

    if (cycle.status === "closed") {
      throw new HTTPException(400, {
        message: "Tasks cannot be added to a closed cycle",
      });
    }
  }

  if (task.cycleId === nextCycleId) {
    return task;
  }

  const [updated] = await db
    .update(taskTable)
    .set({ cycleId: nextCycleId })
    .where(eq(taskTable.id, taskId))
    .returning();

  if (!updated) {
    throw new HTTPException(500, { message: "Failed to update task cycle" });
  }

  await publishEvent("task.cycle_changed", {
    taskId: updated.id,
    projectId: updated.projectId,
    userId: currentUserId,
    oldCycleId: task.cycleId,
    newCycleId: nextCycleId,
    title: updated.title,
    type: "cycle_changed",
  });

  return updated;
}

export default updateTaskCycle;
