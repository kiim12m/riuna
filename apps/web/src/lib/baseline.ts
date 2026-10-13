import { dayKey, parseDayKey } from "./day-key";

/**
 * La linea base de una vista (ADR 085): con que momento se compara. Los
 * relativos se recalculan cada dia —una vista guardada con «ayer» sigue
 * diciendo ayer manana—; una fecha se queda fija.
 */
export const BASELINE_PRESETS = ["yesterday", "lastWorkDay", "week"] as const;
export type BaselinePreset = (typeof BASELINE_PRESETS)[number];
/** Un relativo o un dia `yyyy-mm-dd`. */
export type BaselineChoice = BaselinePreset | string;

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isBaselineChoice(value: unknown): value is BaselineChoice {
  return (
    typeof value === "string" &&
    (BASELINE_PRESETS.includes(value as BaselinePreset) ||
      DAY_PATTERN.test(value))
  );
}

export function isBaselinePreset(value: string): value is BaselinePreset {
  return BASELINE_PRESETS.includes(value as BaselinePreset);
}

/** Lunes a viernes, con la mascara de la jornada (bit 0 domingo, ADR 045). */
const WEEKDAYS = 0b0111110;
const MAX_STEPS = 400;

/**
 * El dia, `yyyy-mm-dd`, desde cuyo comienzo se compara: la vista de entonces
 * es la de las 00:00 de ese dia, antes de cualquier cambio suyo. «El ultimo
 * dia laborable» es el anterior a hoy que no cae en fin de semana ni en un
 * festivo del espacio: un lunes, el viernes.
 */
export function baselineDayKey(
  choice: BaselineChoice,
  todayKey: string,
  holidays: ReadonlySet<string> = new Set(),
): string {
  if (!isBaselinePreset(choice)) return choice;
  const date = parseDayKey(todayKey);
  if (choice === "yesterday") {
    date.setDate(date.getDate() - 1);
    return dayKey(date);
  }
  if (choice === "week") {
    date.setDate(date.getDate() - 7);
    return dayKey(date);
  }
  for (let step = 1; step <= MAX_STEPS; step++) {
    date.setDate(date.getDate() - 1);
    if (!((WEEKDAYS >> date.getDay()) & 1)) continue;
    const key = dayKey(date);
    if (!holidays.has(key)) return key;
  }
  return dayKey(new Date(date.getFullYear(), date.getMonth(), date.getDate()));
}

/** El instante que se pide a la API: la medianoche local de ese dia. */
export function baselineMoment(
  choice: BaselineChoice,
  todayKey: string,
  holidays?: ReadonlySet<string>,
): string {
  return parseDayKey(baselineDayKey(choice, todayKey, holidays)).toISOString();
}
