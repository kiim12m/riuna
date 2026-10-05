import { dayKey } from "./day-key";

/**
 * Una ausencia puede durar hasta un ano (ADR 060): sin un tope por encima de
 * eso, el recorrido de `nextWorkDayKey` no acabaria con una jornada vacia.
 */
const MAX_STEPS = 400;

/**
 * El siguiente dia laborable despues de `fromKey`, segun la mascara de la
 * jornada personal (bit 0 domingo … bit 6 sabado, como `Date#getDay()`,
 * ADR 045) y saltando los dias no disponibles —festivos del espacio y
 * ausencias propias, ADR 060—. Sin ningun dia laborable, el dia siguiente:
 * mejor eso que no devolver nada.
 */
export function nextWorkDayKey(
  fromKey: string,
  workDays: number,
  unavailable: ReadonlySet<string> = new Set(),
): string {
  const [year, month, day] = fromKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  for (let step = 1; step <= MAX_STEPS; step++) {
    date.setDate(date.getDate() + 1);
    if (!((workDays >> date.getDay()) & 1)) continue;
    const key = dayKey(date);
    if (!unavailable.has(key)) return key;
  }
  return dayKey(new Date(year, month - 1, day + 1));
}

/**
 * Los dias que no se trabajan por un festivo o por una ausencia, como claves
 * `yyyy-mm-dd`. Una ausencia es un rango con los dos extremos incluidos.
 */
export function unavailableDayKeys(
  holidays: ReadonlyArray<{ day: string | Date }>,
  timeOff: ReadonlyArray<{ startsOn: string | Date; endsOn: string | Date }>,
): Set<string> {
  const keys = new Set<string>();
  for (const holiday of holidays) keys.add(dayKey(new Date(holiday.day)));
  for (const range of timeOff) {
    const end = dayKey(new Date(range.endsOn));
    const cursor = new Date(range.startsOn);
    for (let step = 0; step <= MAX_STEPS; step++) {
      const key = dayKey(cursor);
      if (key > end) break;
      keys.add(key);
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  return keys;
}
