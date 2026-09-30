import { formatDate } from "./format";

// 1 de enero de 2023 fue domingo: referencia estable para nombrar los siete
// dias de la semana sin depender de en que dia corre esto.
const WEEK_REFERENCE_SUNDAY = new Date(Date.UTC(2023, 0, 1));

/** Lunes primero, domingo al final -mismo orden en que se leen los 7 dias-. */
export const WEEKDAYS_MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0];

/** El nombre del dia de la semana para un `Date#getDay()` (0 domingo). */
export function weekdayLabel(day: number) {
  const reference = new Date(WEEK_REFERENCE_SUNDAY);
  reference.setUTCDate(reference.getUTCDate() + day);
  return formatDate(reference, { weekday: "short" });
}
