import { and, eq, notInArray, or } from "drizzle-orm";
import db from "../../database";
import { taskAssigneeTable } from "../../database/schema";

/**
 * `task_assignee` guarda el conjunto completo de asignados, incluido el
 * responsable principal de `task.assignee_id`. Estas funciones son el unico
 * sitio que lo escribe, para que ambas vias de asignacion —la de un solo
 * responsable, heredada, y la de varios— no puedan divergir.
 *
 * Todas aceptan una transaccion: quien escribe `task.assignee_id` debe
 * sincronizar el conjunto dentro de la misma, o un fallo entre las dos
 * sentencias deja la divergencia que este modulo existe para impedir.
 */

export type DbOrTx =
  | typeof db
  | Parameters<Parameters<typeof db.transaction>[0]>[0];

async function replaceIn(tx: DbOrTx, taskId: string, unique: string[]) {
  if (unique.length === 0) {
    await tx
      .delete(taskAssigneeTable)
      .where(eq(taskAssigneeTable.taskId, taskId));
    return;
  }

  // Solo se van los que ya no estan en la lista: conservar las filas que
  // siguen mantiene su created_at, que es el orden de asignacion.
  await tx
    .delete(taskAssigneeTable)
    .where(
      and(
        eq(taskAssigneeTable.taskId, taskId),
        notInArray(taskAssigneeTable.userId, unique),
      ),
    );

  await tx
    .insert(taskAssigneeTable)
    .values(unique.map((userId) => ({ taskId, userId })))
    .onConflictDoNothing();
}

export async function replaceAssignees(
  taskId: string,
  userIds: string[],
  dbOrTx?: DbOrTx,
) {
  const unique = [...new Set(userIds)];

  if (dbOrTx) {
    return replaceIn(dbOrTx, taskId, unique);
  }

  await db.transaction((tx) => replaceIn(tx, taskId, unique));
}

export async function getAssigneeIds(
  taskId: string,
  dbOrTx: DbOrTx = db,
): Promise<string[]> {
  const rows = await dbOrTx
    .select({ userId: taskAssigneeTable.userId })
    .from(taskAssigneeTable)
    .where(eq(taskAssigneeTable.taskId, taskId))
    .orderBy(taskAssigneeTable.createdAt);

  return rows.map((row) => row.userId);
}

async function syncPrimaryIn(
  tx: DbOrTx,
  taskId: string,
  previousUserId: string | null,
  nextUserId: string | null,
) {
  if (previousUserId) {
    await tx
      .delete(taskAssigneeTable)
      .where(
        and(
          eq(taskAssigneeTable.taskId, taskId),
          eq(taskAssigneeTable.userId, previousUserId),
        ),
      );
  }

  if (nextUserId) {
    await tx
      .insert(taskAssigneeTable)
      .values({ taskId, userId: nextUserId })
      .onConflictDoNothing();
  }
}

/**
 * Mantiene el conjunto al dia cuando cambia el responsable principal: el
 * anterior sale y el nuevo entra, sin tocar al resto.
 */
export async function syncPrimaryAssignee(
  taskId: string,
  previousUserId: string | null,
  nextUserId: string | null,
  dbOrTx?: DbOrTx,
) {
  if (previousUserId === nextUserId) return;

  if (dbOrTx) {
    return syncPrimaryIn(dbOrTx, taskId, previousUserId, nextUserId);
  }

  await db.transaction((tx) =>
    syncPrimaryIn(tx, taskId, previousUserId, nextUserId),
  );
}

/**
 * La version por lotes del anterior, para `PATCH /task/bulk`: cada tarea trae
 * su propio responsable anterior, pero el siguiente es el mismo para todas.
 * Dos sentencias en vez de dos por tarea.
 */
export async function syncPrimaryAssigneeBulk(
  tasks: { id: string; userId: string | null }[],
  nextUserId: string | null,
  dbOrTx: DbOrTx = db,
) {
  const changed = tasks.filter((task) => task.userId !== nextUserId);

  if (changed.length === 0) return;

  const withPrevious = changed.filter(
    (task): task is { id: string; userId: string } => Boolean(task.userId),
  );

  if (withPrevious.length > 0) {
    await dbOrTx
      .delete(taskAssigneeTable)
      .where(
        or(
          ...withPrevious.map((task) =>
            and(
              eq(taskAssigneeTable.taskId, task.id),
              eq(taskAssigneeTable.userId, task.userId),
            ),
          ),
        ),
      );
  }

  if (nextUserId) {
    await dbOrTx
      .insert(taskAssigneeTable)
      .values(changed.map((task) => ({ taskId: task.id, userId: nextUserId })))
      .onConflictDoNothing();
  }
}
