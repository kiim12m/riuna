import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { taskTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { scheduleAfter } from "../schedule/reschedule";

/**
 * Fechas propias o automaticas (ADR 083). Con automaticas, las de un padre
 * salen de su rama y se dejan de editar a mano; volver a propias conserva las
 * que tuviera en ese momento, que pasan a ser suyas.
 */
async function updateTaskAutoDates({
  id,
  autoDates,
  currentUserId,
}: {
  id: string;
  autoDates: boolean;
  currentUserId: string;
}) {
  const [task] = await db
    .select({
      id: taskTable.id,
      projectId: taskTable.projectId,
      autoDates: taskTable.autoDates,
    })
    .from(taskTable)
    .where(eq(taskTable.id, id))
    .limit(1);
  if (!task) throw new HTTPException(404, { message: "Task not found" });

  if (task.autoDates !== autoDates) {
    await db.update(taskTable).set({ autoDates }).where(eq(taskTable.id, id));
    await publishEvent("task.auto_dates_changed", {
      taskId: id,
      projectId: task.projectId,
      userId: currentUserId,
      autoDates,
      type: "auto_dates_changed",
    });
    await scheduleAfter({
      projectId: task.projectId,
      taskIds: [id],
      actorId: currentUserId,
    });
  }

  const [updated] = await db
    .select()
    .from(taskTable)
    .where(eq(taskTable.id, id))
    .limit(1);
  return updated;
}

export default updateTaskAutoDates;
