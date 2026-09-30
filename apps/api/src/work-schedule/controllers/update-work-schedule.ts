import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { userWorkScheduleTable } from "../../database/schema";
import type { WorkSchedule } from "../get-work-schedule";

/**
 * Crea o reemplaza la jornada de quien mira. Siempre las seis columnas
 * juntas -no un `PATCH` parcial-: la CHECK de la comida depende de tres de
 * ellas a la vez, y dejar que el cliente mande solo una habria obligado a
 * releer la fila antes de poder validar nada.
 */
export default async function updateWorkSchedule(
  userId: string,
  input: WorkSchedule,
): Promise<WorkSchedule> {
  const [row] = await db
    .insert(userWorkScheduleTable)
    .values({ userId, ...input })
    .onConflictDoUpdate({
      target: userWorkScheduleTable.userId,
      set: input,
    })
    .returning({
      workStartMinute: userWorkScheduleTable.workStartMinute,
      workEndMinute: userWorkScheduleTable.workEndMinute,
      lunchEnabled: userWorkScheduleTable.lunchEnabled,
      lunchStartMinute: userWorkScheduleTable.lunchStartMinute,
      lunchEndMinute: userWorkScheduleTable.lunchEndMinute,
      workDays: userWorkScheduleTable.workDays,
    });

  if (!row) {
    throw new HTTPException(500, {
      message: "Failed to save the work schedule",
    });
  }

  return row;
}
