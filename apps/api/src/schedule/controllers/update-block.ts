import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { scheduleBlockTable } from "../../database/schema";
import { publishEvent } from "../../events";

/**
 * Solo cambia los campos de forma (titulo, tipo, horas). Cambiar si es suelto
 * o repetido es borrar y crear de nuevo: mezclar las dos formas en un PATCH
 * obligaria a repetir aqui la misma CHECK que ya impone la tabla.
 */
export default async function updateBlock({
  userId,
  id,
  title,
  kind,
  startMinute,
  endMinute,
}: {
  userId: string;
  id: string;
  title: string;
  kind: "fixed" | "break";
  startMinute: number;
  endMinute: number;
}) {
  const [block] = await db
    .update(scheduleBlockTable)
    .set({ title, kind, startMinute, endMinute, updatedAt: new Date() })
    .where(
      and(eq(scheduleBlockTable.id, id), eq(scheduleBlockTable.userId, userId)),
    )
    .returning();

  if (!block) {
    throw new HTTPException(404, { message: "Block not found" });
  }

  await publishEvent("schedule.changed", { userId });

  return block;
}
