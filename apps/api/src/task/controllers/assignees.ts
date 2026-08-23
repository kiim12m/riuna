import { and, eq, notInArray } from "drizzle-orm";
import db from "../../database";
import { taskAssigneeTable } from "../../database/schema";

/**
 * `task_assignee` guarda el conjunto completo de asignados, incluido el
 * responsable principal de `task.assignee_id`. Estas dos funciones son el
 * unico sitio que lo escribe, para que ambas vias de asignacion —la de un
 * solo responsable, heredada, y la de varios— no puedan divergir.
 */

export async function replaceAssignees(taskId: string, userIds: string[]) {
  const unique = [...new Set(userIds)];

  await db.transaction(async (tx) => {
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
  });
}

export async function getAssigneeIds(taskId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: taskAssigneeTable.userId })
    .from(taskAssigneeTable)
    .where(eq(taskAssigneeTable.taskId, taskId))
    .orderBy(taskAssigneeTable.createdAt);

  return rows.map((row) => row.userId);
}

/**
 * Mantiene el conjunto al dia cuando cambia el responsable principal por la
 * via heredada: el anterior sale y el nuevo entra, sin tocar al resto.
 */
export async function syncPrimaryAssignee(
  taskId: string,
  previousUserId: string | null,
  nextUserId: string | null,
) {
  if (previousUserId === nextUserId) return;

  if (previousUserId) {
    await db
      .delete(taskAssigneeTable)
      .where(
        and(
          eq(taskAssigneeTable.taskId, taskId),
          eq(taskAssigneeTable.userId, previousUserId),
        ),
      );
  }

  if (nextUserId) {
    await db
      .insert(taskAssigneeTable)
      .values({ taskId, userId: nextUserId })
      .onConflictDoNothing();
  }
}
