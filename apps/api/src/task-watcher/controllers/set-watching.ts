import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { taskTable } from "../../database/schema";
import { assertAssignableUser } from "../../utils/assert-assignable-user";
import {
  addWatchers,
  listTaskWatchers,
  publishWatchersChanged,
  removeWatcher,
} from "../watchers";

/**
 * Hace observar o deja de observar una tarea a una persona, y devuelve la
 * lista resultante. Quien llama ya comprobo el permiso: `task:read` para uno
 * mismo, `task:assign` para otra persona (ADR 076).
 */
export default async function setWatching({
  taskId,
  workspaceId,
  actorId,
  targetId,
  watch,
}: {
  taskId: string;
  workspaceId: string;
  actorId: string;
  targetId: string;
  watch: boolean;
}) {
  const [task] = await db
    .select({ projectId: taskTable.projectId })
    .from(taskTable)
    .where(eq(taskTable.id, taskId))
    .limit(1);
  if (!task) {
    throw new HTTPException(404, { message: "Task not found" });
  }

  if (watch) {
    await assertAssignableUser(targetId, workspaceId);
    const added = await addWatchers(taskId, [targetId]);
    await publishWatchersChanged({
      taskId,
      projectId: task.projectId,
      userId: actorId,
      addedIds: added,
    });
  } else if (await removeWatcher(taskId, targetId)) {
    await publishWatchersChanged({
      taskId,
      projectId: task.projectId,
      userId: actorId,
      removedIds: [targetId],
    });
  }

  return listTaskWatchers(taskId, workspaceId);
}
