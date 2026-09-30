import { eq } from "drizzle-orm";
import db from "../database";
import { userWorkScheduleTable } from "../database/schema";

export type WorkSchedule = {
  workStartMinute: number;
  workEndMinute: number;
  lunchEnabled: boolean;
  lunchStartMinute: number | null;
  lunchEndMinute: number | null;
  /** Mascara de 7 bits, indexada como `Date#getDay()`. */
  workDays: number;
};

/**
 * Los mismos valores por defecto de super-productivity: 09:00-17:00, sin
 * comida, lunes a viernes (bits 1-5 de `workDays`, domingo es el bit 0). Una
 * instalacion sin fila en `user_work_schedule` ve esto, asi que nada cambia
 * hasta que alguien guarda su propia jornada (ADR 045).
 */
export const DEFAULT_WORK_SCHEDULE: WorkSchedule = {
  workStartMinute: 9 * 60,
  workEndMinute: 17 * 60,
  lunchEnabled: false,
  lunchStartMinute: null,
  lunchEndMinute: null,
  workDays: 0b0_111_110,
};

export async function getWorkSchedule(userId: string): Promise<WorkSchedule> {
  const [row] = await db
    .select({
      workStartMinute: userWorkScheduleTable.workStartMinute,
      workEndMinute: userWorkScheduleTable.workEndMinute,
      lunchEnabled: userWorkScheduleTable.lunchEnabled,
      lunchStartMinute: userWorkScheduleTable.lunchStartMinute,
      lunchEndMinute: userWorkScheduleTable.lunchEndMinute,
      workDays: userWorkScheduleTable.workDays,
    })
    .from(userWorkScheduleTable)
    .where(eq(userWorkScheduleTable.userId, userId))
    .limit(1);

  return row ?? DEFAULT_WORK_SCHEDULE;
}
