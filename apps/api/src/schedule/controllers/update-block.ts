import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { scheduleBlockTable } from "../../database/schema";
import { publishEvent } from "../../events";

/**
 * Nunca cambia si es suelto o repetido -mezclar las dos formas en un PATCH
 * obligaria a repetir aqui la misma CHECK que ya impone la tabla, y borrar y
 * crear de nuevo ya cubre ese caso-. Dentro de cada forma si se puede mover:
 * `plannedDate` en uno suelto (a que dia), `endsAt` en uno repetido (hasta
 * cuando). Se comprueba contra la fila real, no contra lo que mande quien
 * llama, porque el chequeo `schedule_block_date_xor_cadence` reventaria con
 * un 500 crudo si se le cuela `plannedDate` en un bloque que ya tiene
 * `cadence`.
 */
export default async function updateBlock({
  userId,
  workspaceId,
  id,
  title,
  kind,
  startMinute,
  endMinute,
  plannedDate,
  endsAt,
}: {
  userId: string;
  workspaceId: string;
  id: string;
  title: string;
  kind: "fixed" | "break";
  startMinute: number;
  endMinute: number;
  /** `undefined`: no tocar. Solo valido si el bloque ya es suelto. */
  plannedDate?: Date;
  /** `undefined`: no tocar. `null` quita el limite. Solo valido si repite. */
  endsAt?: Date | null;
}) {
  const [existing] = await db
    .select()
    .from(scheduleBlockTable)
    .where(
      and(
        eq(scheduleBlockTable.id, id),
        eq(scheduleBlockTable.userId, userId),
        eq(scheduleBlockTable.workspaceId, workspaceId),
      ),
    );

  if (!existing) {
    throw new HTTPException(404, { message: "Block not found" });
  }
  if (plannedDate !== undefined && !existing.plannedDate) {
    throw new HTTPException(400, {
      message: "This block repeats; it has no single day to move",
    });
  }
  if (endsAt !== undefined && !existing.cadence) {
    throw new HTTPException(400, {
      message: "This block does not repeat; it has no end date to set",
    });
  }

  const [block] = await db
    .update(scheduleBlockTable)
    .set({
      title,
      kind,
      startMinute,
      endMinute,
      ...(plannedDate !== undefined && { plannedDate }),
      ...(endsAt !== undefined && { endsAt }),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(scheduleBlockTable.id, id),
        eq(scheduleBlockTable.userId, userId),
        eq(scheduleBlockTable.workspaceId, workspaceId),
      ),
    )
    .returning();

  await publishEvent("schedule.changed", { userId });

  return block;
}
