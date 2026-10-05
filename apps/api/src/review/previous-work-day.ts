import { addDays, serverDayKey } from "../utils/day-boundaries";
import { isWorkDay } from "../work-schedule/day-capacity";
import type { getWorkSchedule } from "../work-schedule/get-work-schedule";

/**
 * Hasta donde se mira atras buscando «ayer»: cubre unas vacaciones largas.
 * Mas alla, el dia anterior.
 */
export const STANDUP_LOOKBACK_DAYS = 31;

/**
 * El ultimo dia laborable antes de `day` segun la jornada personal
 * (ADR 045), saltando festivos y ausencias (`unavailable`, por
 * `yyyy-mm-dd`, ADR 060): un lunes, el viernes; tras un lunes festivo, el
 * viernes tambien. Sin ninguno, el dia anterior.
 */
export function previousWorkDay(
  day: Date,
  schedule: Awaited<ReturnType<typeof getWorkSchedule>>,
  unavailable: ReadonlySet<string> = new Set(),
) {
  for (let back = 1; back <= STANDUP_LOOKBACK_DAYS; back++) {
    const candidate = addDays(day, -back);
    if (
      isWorkDay(schedule, candidate) &&
      !unavailable.has(serverDayKey(candidate))
    ) {
      return candidate;
    }
  }
  return addDays(day, -1);
}
