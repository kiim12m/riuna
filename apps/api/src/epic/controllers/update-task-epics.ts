import { and, eq, inArray } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { epicTable, taskEpicTable, taskTable } from "../../database/schema";
import { publishEvent } from "../../events";

/**
 * Reemplaza el conjunto de epicas de una tarea. Se pasa la lista entera y no
 * un anadir/quitar: es la misma forma que `update-task-assignees` de la Fase 1
 * y evita que dos pestanas abiertas se pisen a base de deltas.
 */
async function updateTaskEpics({
  taskId,
  epicIds,
  currentUserId,
}: {
  taskId: string;
  epicIds: string[];
  currentUserId: string;
}) {
  const [task] = await db
    .select({ id: taskTable.id, projectId: taskTable.projectId })
    .from(taskTable)
    .where(eq(taskTable.id, taskId))
    .limit(1);

  if (!task) {
    throw new HTTPException(404, { message: "Task not found" });
  }

  const requested = [...new Set(epicIds.filter(Boolean))];

  if (requested.length > 0) {
    const found = await db
      .select({ id: epicTable.id })
      .from(epicTable)
      .where(
        and(
          inArray(epicTable.id, requested),
          eq(epicTable.projectId, task.projectId),
        ),
      );

    if (found.length !== requested.length) {
      throw new HTTPException(400, {
        message: "Every epic must belong to the task's project",
      });
    }
  }

  await db.transaction(async (tx) => {
    await tx.delete(taskEpicTable).where(eq(taskEpicTable.taskId, taskId));

    if (requested.length > 0) {
      await tx
        .insert(taskEpicTable)
        .values(requested.map((epicId) => ({ taskId, epicId })));
    }
  });

  await publishEvent("task.epics_changed", {
    taskId,
    projectId: task.projectId,
    userId: currentUserId,
    type: "epics_changed",
  });

  return { taskId, epicIds: requested };
}

export default updateTaskEpics;
