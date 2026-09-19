import {
  addDays,
  addMonths,
  getDate,
  getDay,
  getDaysInMonth,
  setDate,
  startOfDay,
} from "date-fns";

export type Cadence =
  | { frequency: "daily"; interval: number }
  | { frequency: "weekly"; interval: number; byWeekday: number[] }
  | { frequency: "monthly"; interval: number; byMonthDay: number };

export const MAX_INTERVAL = 365;

/**
 * La cadencia se valida aqui y no solo en el borde: la fila de la base guarda
 * `jsonb`, asi que lo unico que impide que llegue basura es esta funcion.
 */
export function parseCadence(value: unknown): Cadence {
  if (typeof value !== "object" || value === null) {
    throw new Error("The cadence must be an object");
  }

  const raw = value as Record<string, unknown>;
  const interval = Number(raw.interval ?? 1);

  if (!Number.isInteger(interval) || interval < 1 || interval > MAX_INTERVAL) {
    throw new Error(
      `The interval must be an integer between 1 and ${MAX_INTERVAL}`,
    );
  }

  if (raw.frequency === "daily") {
    return { frequency: "daily", interval };
  }

  if (raw.frequency === "weekly") {
    const days = Array.isArray(raw.byWeekday) ? raw.byWeekday : [];
    const byWeekday = [
      ...new Set(
        days.filter(
          (day): day is number =>
            Number.isInteger(day) &&
            (day as number) >= 0 &&
            (day as number) <= 6,
        ),
      ),
    ].sort((a, b) => a - b);

    if (byWeekday.length === 0) {
      throw new Error("A weekly cadence needs at least one weekday");
    }

    return { frequency: "weekly", interval, byWeekday };
  }

  if (raw.frequency === "monthly") {
    const byMonthDay = Number(raw.byMonthDay ?? 1);

    if (!Number.isInteger(byMonthDay) || byMonthDay < 1 || byMonthDay > 31) {
      throw new Error("The day of the month must be between 1 and 31");
    }

    return { frequency: "monthly", interval, byMonthDay };
  }

  throw new Error("The frequency must be daily, weekly or monthly");
}

/**
 * El dia `day` de ese mes, **recortado al ultimo dia si el mes es mas corto**.
 *
 * Es la trampa clasica de la recurrencia mensual: `setDate(31)` sobre febrero
 * no falla, se desborda a marzo, y una tarea del dia 31 acaba apareciendo el 3
 * de marzo. Recortar es lo que espera quien configura "el ultimo dia de cada
 * mes" escribiendo 31.
 */
function clampToMonth(reference: Date, day: number): Date {
  return setDate(reference, Math.min(day, getDaysInMonth(reference)));
}

/**
 * La siguiente ocurrencia **estrictamente posterior** a `after`.
 *
 * Estrictamente posterior importa: si devolviera la misma fecha cuando `after`
 * ya cae en la cadencia, el planificador generaria la misma tarea en cada
 * vuelta sin avanzar nunca.
 *
 * Todo se calcula al principio del dia. La hora del dia no se guarda a
 * proposito: una tarea recurrente es "toca hoy", no "toca a las 9:03", y
 * arrastrar la hora original haria que el generador dependiera de a que hora se
 * creo la recurrencia.
 */
export function nextOccurrence(cadence: Cadence, after: Date): Date {
  const from = startOfDay(after);

  if (cadence.frequency === "daily") {
    return addDays(from, cadence.interval);
  }

  if (cadence.frequency === "weekly") {
    // Se avanza dia a dia hasta caer en un dia marcado. Como mucho da una
    // vuelta de semana por intervalo, asi que el bucle esta acotado.
    const maxDays = 7 * cadence.interval + 7;

    for (let offset = 1; offset <= maxDays; offset += 1) {
      const candidate = addDays(from, offset);

      if (!cadence.byWeekday.includes(getDay(candidate))) continue;

      // Con intervalo 1 vale cualquier dia marcado. Con intervalo > 1 solo
      // valen las semanas que tocan, contadas desde la semana de `from`.
      if (cadence.interval === 1) return candidate;

      const weeksApart = Math.floor(offset / 7);
      if (weeksApart % cadence.interval === 0 && offset >= 7) return candidate;
      if (weeksApart === 0) continue;
    }

    // Inalcanzable con una cadencia valida, pero mejor una fecha que un bucle
    // infinito rio abajo.
    return addDays(from, 7 * cadence.interval);
  }

  const candidateThisMonth = clampToMonth(from, cadence.byMonthDay);

  if (candidateThisMonth > from) {
    return candidateThisMonth;
  }

  return clampToMonth(addMonths(from, cadence.interval), cadence.byMonthDay);
}

/**
 * Adelanta `nextRunAt` hasta pasar de `now`, contando cuantas ocurrencias se
 * han saltado.
 *
 * Hace falta porque la instancia puede haber estado parada: si una recurrencia
 * diaria lleva tres dias sin correr, lo que se espera es **una** tarea y la
 * proxima fecha al dia, no tres tareas de golpe ni una fecha en el pasado que
 * vuelva a disparar en la siguiente vuelta.
 */
export function advancePast(
  cadence: Cadence,
  from: Date,
  now: Date,
): { nextRunAt: Date; skipped: number } {
  let cursor = from;
  let skipped = 0;

  // El tope evita que una fecha absurda del pasado bloquee el proceso.
  while (cursor <= now && skipped < 1000) {
    cursor = nextOccurrence(cadence, cursor);
    skipped += 1;
  }

  return { nextRunAt: cursor, skipped };
}

/** Un dia legible para el titulo de la tarea generada. */
export function occurrenceLabel(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(getDate(date)).padStart(2, "0")}`;
}
