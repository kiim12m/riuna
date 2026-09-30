import { and, eq, inArray } from "drizzle-orm";
import db from "../../database";
import { personalPlanEntryTable } from "../../database/schema";
import { publishEvent } from "../../events";

/**
 * Reescribe la posicion de las entradas de un dia, en el orden recibido.
 *
 * Arreglа el reordenado que rompia `setPlanEntry`: soltar una tarjeta dentro
 * de su propia columna mandaba el indice que ya tenia -no el que le tocaba en
 * el sitio donde se solto-, asi que dos tarjetas competian por la misma
 * posicion. Aqui el Planificador manda **toda la columna**, ya en el orden
 * final, y esto se limita a numerarla de 0 a n.
 *
 * Ids que no sean de este usuario, este dia y este espacio se ignoran en vez
 * de fallar entero: es lo mismo que ya hace `removePlanEntry` con
 * `workspace_id` en la propia fila de `personal_plan_entry`, sin join contra
 * `task`/`project`.
 */
export default async function setPlanOrder({
  workspaceId,
  userId,
  plannedDate,
  taskIds,
}: {
  workspaceId: string;
  userId: string;
  plannedDate: Date;
  taskIds: string[];
}): Promise<{ updated: number }> {
  if (taskIds.length === 0) {
    return { updated: 0 };
  }

  return db.transaction(async (tx) => {
    const rows = await tx
      .select({ taskId: personalPlanEntryTable.taskId })
      .from(personalPlanEntryTable)
      .where(
        and(
          eq(personalPlanEntryTable.userId, userId),
          eq(personalPlanEntryTable.workspaceId, workspaceId),
          eq(personalPlanEntryTable.plannedDate, plannedDate),
          inArray(personalPlanEntryTable.taskId, taskIds),
        ),
      );
    const validIds = new Set(rows.map((row) => row.taskId));

    let position = 0;
    for (const taskId of taskIds) {
      if (!validIds.has(taskId)) continue;

      await tx
        .update(personalPlanEntryTable)
        .set({ position })
        .where(
          and(
            eq(personalPlanEntryTable.userId, userId),
            eq(personalPlanEntryTable.taskId, taskId),
          ),
        );
      position += 1;
    }

    await publishEvent("personal-plan.changed", { userId });

    return { updated: position };
  });
}
