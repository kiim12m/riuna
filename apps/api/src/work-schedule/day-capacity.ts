import type { WorkSchedule } from "./get-work-schedule";

export type MinuteInterval = { startMinute: number; endMinute: number };

/** `(workDays >> date.getDay()) & 1`: domingo es el bit 0, sabado el bit 6. */
export function isWorkDay(schedule: WorkSchedule, dayDate: Date): boolean {
  return Boolean((schedule.workDays >> dayDate.getDay()) & 1);
}

/**
 * Recorta cada intervalo a la jornada y funde los que se solapan, para no
 * restar dos veces un minuto que la comida y un bloque cerrado comparten.
 * Barrido de un solo paso sobre los intervalos ya ordenados por inicio.
 */
function unionMinutesWithin(
  intervals: MinuteInterval[],
  workStart: number,
  workEnd: number,
): number {
  const clipped = intervals
    .map((interval) => ({
      startMinute: Math.max(interval.startMinute, workStart),
      endMinute: Math.min(interval.endMinute, workEnd),
    }))
    .filter((interval) => interval.endMinute > interval.startMinute)
    .sort((a, b) => a.startMinute - b.startMinute);

  let total = 0;
  let currentStart: number | null = null;
  let currentEnd: number | null = null;

  for (const interval of clipped) {
    if (currentEnd === null) {
      currentStart = interval.startMinute;
      currentEnd = interval.endMinute;
      continue;
    }
    if (interval.startMinute <= currentEnd) {
      currentEnd = Math.max(currentEnd, interval.endMinute);
    } else {
      total += currentEnd - (currentStart ?? currentEnd);
      currentStart = interval.startMinute;
      currentEnd = interval.endMinute;
    }
  }
  if (currentEnd !== null) {
    total += currentEnd - (currentStart ?? currentEnd);
  }

  return total;
}

/**
 * La capacidad de un dia, en segundos: 0 si no es laborable; si lo es, la
 * jornada menos la union de la comida y los bloques `break` de ese dia
 * (ADR 045) -nunca restados por separado, o una comida que se solapa con un
 * bloque cerrado contaria su minuto compartido dos veces-. Amplia
 * `calculateAvailableHours` de super-productivity, que solo conocia la
 * comida.
 */
export function dayCapacitySeconds(
  schedule: WorkSchedule,
  dayDate: Date,
  breakIntervals: MinuteInterval[],
): number {
  if (!isWorkDay(schedule, dayDate)) return 0;

  const { workStartMinute, workEndMinute } = schedule;
  const intervals: MinuteInterval[] = [...breakIntervals];
  if (
    schedule.lunchEnabled &&
    schedule.lunchStartMinute != null &&
    schedule.lunchEndMinute != null
  ) {
    intervals.push({
      startMinute: schedule.lunchStartMinute,
      endMinute: schedule.lunchEndMinute,
    });
  }

  const busyMinutes = unionMinutesWithin(
    intervals,
    workStartMinute,
    workEndMinute,
  );
  const totalMinutes = workEndMinute - workStartMinute - busyMinutes;

  return Math.max(0, totalMinutes) * 60;
}

/**
 * `dayCapacitySeconds`, pero a partir de los bloques crudos de un dia
 * (`blocksByDay.get(dayKey)`): filtra los `break` y los recorta a
 * `MinuteInterval`. El Planificador y Hoy repetian este emparejamiento cada
 * uno por su cuenta (ADR 045, ADR 047); un cambio en como se derivan los
 * `break` -por ejemplo un nuevo `kind`- solo hacia falta tocarlo aqui.
 *
 * Un festivo o una ausencia (`unavailable`, ADR 060) valen 0, como un dia
 * no laborable.
 */
export function capacityForDay(
  schedule: WorkSchedule,
  dayDate: Date,
  dayBlocks: { kind: string; startMinute: number; endMinute: number }[],
  unavailable = false,
): number {
  if (unavailable) return 0;
  const breakIntervals = dayBlocks
    .filter((block) => block.kind === "break")
    .map((block) => ({
      startMinute: block.startMinute,
      endMinute: block.endMinute,
    }));
  return dayCapacitySeconds(schedule, dayDate, breakIntervals);
}
