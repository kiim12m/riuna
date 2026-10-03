import { and, eq } from "drizzle-orm";
import db from "../database";
import { reviewTable } from "../database/schema";

/**
 * Si el dia ya esta cerrado, para la marca del boton de Hoy. Va aparte de
 * `get-day-review.ts` para que quien lo use desde fuera del modulo no
 * arrastre la tabla privada (ADR 054).
 */
export async function isDayClosed({
  workspaceId,
  userId,
  day,
}: {
  workspaceId: string;
  userId: string;
  day: Date;
}) {
  const [row] = await db
    .select({ id: reviewTable.id })
    .from(reviewTable)
    .where(
      and(
        eq(reviewTable.userId, userId),
        eq(reviewTable.workspaceId, workspaceId),
        eq(reviewTable.period, "day"),
        eq(reviewTable.periodStart, day),
      ),
    )
    .limit(1);

  return Boolean(row);
}
