import { and, asc, eq, inArray } from "drizzle-orm";
import db from "../database";
import {
  projectTable,
  taskAssigneeTable,
  taskTable,
  taskWatcherTable,
  userTable,
} from "../database/schema";
import { publishEvent } from "../events";
import type { DbOrTx } from "../task/controllers/assignees";
import { filterAssignableUsers } from "../utils/assert-assignable-user";

/**
 * Observadores de tarea (ADR 076). Este modulo es el unico que escribe
 * `task_watcher` y el unico que decide a quien avisa una tarea, para que los
 * comentarios, los estados y los vencimientos no lleven cada uno su lista.
 */

/**
 * Hace observar la tarea a estas personas y devuelve las que no la
 * observaban. Quien ya observa no cambia: conserva su `created_at`.
 */
export async function addWatchers(
  taskId: string,
  userIds: string[],
  executor: DbOrTx = db,
): Promise<string[]> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return [];

  const rows = await executor
    .insert(taskWatcherTable)
    .values(unique.map((userId) => ({ taskId, userId })))
    .onConflictDoNothing()
    .returning({ userId: taskWatcherTable.userId });

  return rows.map((row) => row.userId);
}

/** Deja de hacer observar la tarea a esta persona. Dice si la observaba. */
export async function removeWatcher(
  taskId: string,
  userId: string,
): Promise<boolean> {
  const rows = await db
    .delete(taskWatcherTable)
    .where(
      and(
        eq(taskWatcherTable.taskId, taskId),
        eq(taskWatcherTable.userId, userId),
      ),
    )
    .returning({ userId: taskWatcherTable.userId });

  return rows.length > 0;
}

/**
 * Avisa de que cambio quien observa. El detalle de la tarea lo oye por el
 * canal del proyecto y «Observando» de quien entra o sale, por el de usuario.
 */
export async function publishWatchersChanged({
  taskId,
  projectId,
  userId,
  addedIds = [],
  removedIds = [],
}: {
  taskId: string;
  projectId: string;
  userId: string;
  addedIds?: string[];
  removedIds?: string[];
}) {
  if (addedIds.length === 0 && removedIds.length === 0) return;
  await publishEvent("task.watchers_changed", {
    taskId,
    projectId,
    userId,
    addedIds,
    removedIds,
  });
}

/**
 * Hace observar una tarea a quien la toca —la crea, la comenta o sale
 * mencionado— y lo publica. Para los caminos que ya tienen la tarea a mano.
 */
export async function watchBecauseInvolved({
  taskId,
  projectId,
  actorId,
  userIds,
}: {
  taskId: string;
  projectId: string;
  actorId: string;
  userIds: string[];
}) {
  const added = await addWatchers(taskId, userIds);
  await publishWatchersChanged({
    taskId,
    projectId,
    userId: actorId,
    addedIds: added,
  });
}

export type AudienceMember = {
  userId: string;
  /** Por que le llega: asignada, o solo observa. Cambia el texto del aviso. */
  reason: "assignee" | "watcher";
};

/**
 * A quien avisa lo que pasa en una tarea: sus asignados y sus observadores,
 * menos `exclude` y menos quien ya no es del espacio. Los asignados son
 * observadores implicitos: estan aunque no tengan fila en `task_watcher`.
 */
export async function taskAudience(
  taskId: string,
  exclude: Array<string | null | undefined> = [],
): Promise<AudienceMember[]> {
  const [task] = await db
    .select({ workspaceId: projectTable.workspaceId })
    .from(taskTable)
    .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .where(eq(taskTable.id, taskId))
    .limit(1);
  if (!task) return [];

  const [assignees, watchers] = await Promise.all([
    db
      .select({ userId: taskAssigneeTable.userId })
      .from(taskAssigneeTable)
      .where(eq(taskAssigneeTable.taskId, taskId)),
    db
      .select({ userId: taskWatcherTable.userId })
      .from(taskWatcherTable)
      .where(eq(taskWatcherTable.taskId, taskId)),
  ]);

  const skip = new Set(exclude.filter(Boolean));
  const assigned = new Set(assignees.map((row) => row.userId));
  const candidates = [
    ...new Set([...assignees, ...watchers].map((row) => row.userId)),
  ].filter((userId) => !skip.has(userId));

  const members = await filterAssignableUsers(candidates, task.workspaceId);
  return candidates
    .filter((userId) => members.has(userId))
    .map((userId) => ({
      userId,
      reason: assigned.has(userId) ? "assignee" : "watcher",
    }));
}

export type TaskWatcher = {
  userId: string;
  name: string | null;
  image: string | null;
  /** Observa a proposito: tiene fila en `task_watcher`. */
  watching: boolean;
  /** Esta asignada, asi que observa aunque no tenga fila. */
  assignee: boolean;
};

/**
 * Quien observa la tarea, a proposito o por estar asignado, sin quien ya no es
 * del espacio. Primero los asignados, luego por orden de llegada.
 */
export async function listTaskWatchers(
  taskId: string,
  workspaceId: string,
): Promise<TaskWatcher[]> {
  const [assignees, watchers] = await Promise.all([
    db
      .select({ userId: taskAssigneeTable.userId })
      .from(taskAssigneeTable)
      .where(eq(taskAssigneeTable.taskId, taskId))
      .orderBy(asc(taskAssigneeTable.createdAt)),
    db
      .select({ userId: taskWatcherTable.userId })
      .from(taskWatcherTable)
      .where(eq(taskWatcherTable.taskId, taskId))
      .orderBy(asc(taskWatcherTable.createdAt)),
  ]);

  const assigned = new Set(assignees.map((row) => row.userId));
  const watching = new Set(watchers.map((row) => row.userId));
  const ordered = [...new Set([...assigned, ...watching])];
  if (ordered.length === 0) return [];

  const [members, users] = await Promise.all([
    filterAssignableUsers(ordered, workspaceId),
    db
      .select({
        id: userTable.id,
        name: userTable.name,
        image: userTable.image,
      })
      .from(userTable)
      .where(inArray(userTable.id, ordered)),
  ]);
  const byId = new Map(users.map((user) => [user.id, user]));

  return ordered
    .filter((userId) => members.has(userId))
    .map((userId) => ({
      userId,
      name: byId.get(userId)?.name ?? null,
      image: byId.get(userId)?.image ?? null,
      watching: watching.has(userId),
      assignee: assigned.has(userId),
    }));
}
