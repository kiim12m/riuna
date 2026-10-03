import { and, eq, inArray, sql } from "drizzle-orm";
import db from "../../database";
import {
  personalPlanEntryTable,
  projectTable,
  taskTable,
} from "../../database/schema";
import { publishEvent } from "../../events";

/**
 * Planifica varias tareas en un dia, al final de lo que ya tenga y en el
 * orden recibido, o las saca del plan con `plannedDate: null` (la deuda de la
 * ADR 047: «Añadir todo a hoy»). Como `setPlanEntry`, nunca toca `due_date`, y
 * conserva la hora anclada de las que ya la tenian.
 *
 * Las tareas de otro espacio se ignoran en vez de fallar entero, como en
 * `setPlanOrder`: el espacio de la tarea manda, no el de la query.
 */
export default async function planBulk({
  workspaceId,
  userId,
  taskIds,
  plannedDate,
}: {
  workspaceId: string;
  userId: string;
  taskIds: string[];
  plannedDate: Date | null;
}): Promise<{ updated: number }> {
  const uniqueIds = [...new Set(taskIds)];

  const updated = await db.transaction(async (tx) => {
    if (plannedDate === null) {
      const removed = await tx
        .delete(personalPlanEntryTable)
        .where(
          and(
            eq(personalPlanEntryTable.userId, userId),
            eq(personalPlanEntryTable.workspaceId, workspaceId),
            inArray(personalPlanEntryTable.taskId, uniqueIds),
          ),
        )
        .returning({ id: personalPlanEntryTable.id });
      return removed.length;
    }

    const owned = await tx
      .select({ id: taskTable.id })
      .from(taskTable)
      .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
      .where(
        and(
          inArray(taskTable.id, uniqueIds),
          eq(projectTable.workspaceId, workspaceId),
        ),
      );
    const ownedIds = new Set(owned.map((row) => row.id));
    const ordered = uniqueIds.filter((id) => ownedIds.has(id));
    if (ordered.length === 0) return 0;

    // Las que ya estan ese dia conservan su sitio; el resto va detras.
    const [row] = await tx
      .select({
        max: sql<number | null>`max(${personalPlanEntryTable.position})`,
      })
      .from(personalPlanEntryTable)
      .where(
        and(
          eq(personalPlanEntryTable.userId, userId),
          eq(personalPlanEntryTable.workspaceId, workspaceId),
          eq(personalPlanEntryTable.plannedDate, plannedDate),
        ),
      );
    const alreadyThere = await tx
      .select({ taskId: personalPlanEntryTable.taskId })
      .from(personalPlanEntryTable)
      .where(
        and(
          eq(personalPlanEntryTable.userId, userId),
          eq(personalPlanEntryTable.plannedDate, plannedDate),
          inArray(personalPlanEntryTable.taskId, ordered),
        ),
      );
    const stay = new Set(alreadyThere.map((entry) => entry.taskId));
    const moving = ordered.filter((id) => !stay.has(id));
    if (moving.length === 0) return 0;

    const start = (row?.max ?? -1) + 1;
    await tx
      .insert(personalPlanEntryTable)
      .values(
        moving.map((taskId, index) => ({
          workspaceId,
          userId,
          taskId,
          plannedDate,
          position: start + index,
        })),
      )
      .onConflictDoUpdate({
        target: [personalPlanEntryTable.userId, personalPlanEntryTable.taskId],
        set: {
          plannedDate,
          position: sql`excluded.position`,
          updatedAt: new Date(),
        },
      });

    return moving.length;
  });

  if (updated > 0) {
    await publishEvent("personal-plan.changed", { userId });
  }

  return { updated };
}
