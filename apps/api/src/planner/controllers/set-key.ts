import { and, eq, isNotNull, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { personalPlanEntryTable } from "../../database/schema";
import { publishEvent } from "../../events";

const KEY_RANKS = [1, 2, 3] as const;

/**
 * Marca o desmarca una tarea planificada como imprescindible de su dia
 * (ADR 053). Al marcarla toma el primer puesto libre de los tres; sin puesto
 * libre, 409. El indice unico parcial impone el maximo aunque dos peticiones
 * lleguen a la vez, y el candado por persona evita que esas dos se lo
 * disputen y una acabe en 500.
 */
export default async function setKey({
  workspaceId,
  userId,
  taskId,
  key,
}: {
  workspaceId: string;
  userId: string;
  taskId: string;
  key: boolean;
}): Promise<{ keyRank: number | null }> {
  const keyRank = await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(1525, hashtext(${userId}))`,
    );

    const [entry] = await tx
      .select({
        id: personalPlanEntryTable.id,
        plannedDate: personalPlanEntryTable.plannedDate,
        keyRank: personalPlanEntryTable.keyRank,
      })
      .from(personalPlanEntryTable)
      .where(
        and(
          eq(personalPlanEntryTable.userId, userId),
          eq(personalPlanEntryTable.workspaceId, workspaceId),
          eq(personalPlanEntryTable.taskId, taskId),
        ),
      );

    // Solo lo planificado puede ser imprescindible: el puesto es de un dia.
    if (!entry) {
      throw new HTTPException(404, { message: "Plan entry not found" });
    }

    if (!key || entry.keyRank !== null) {
      const next = key ? entry.keyRank : null;
      if (next !== entry.keyRank) {
        await tx
          .update(personalPlanEntryTable)
          .set({ keyRank: next })
          .where(eq(personalPlanEntryTable.id, entry.id));
      }
      return next;
    }

    const taken = await tx
      .select({ keyRank: personalPlanEntryTable.keyRank })
      .from(personalPlanEntryTable)
      .where(
        and(
          eq(personalPlanEntryTable.userId, userId),
          eq(personalPlanEntryTable.workspaceId, workspaceId),
          eq(personalPlanEntryTable.plannedDate, entry.plannedDate),
          isNotNull(personalPlanEntryTable.keyRank),
        ),
      );
    const takenRanks = new Set(taken.map((row) => row.keyRank));
    const free = KEY_RANKS.find((rank) => !takenRanks.has(rank));

    if (free === undefined) {
      throw new HTTPException(409, {
        message: "There are already three key tasks on that day",
      });
    }

    await tx
      .update(personalPlanEntryTable)
      .set({ keyRank: free })
      .where(eq(personalPlanEntryTable.id, entry.id));
    return free;
  });

  await publishEvent("personal-plan.changed", { userId });

  return { keyRank };
}
