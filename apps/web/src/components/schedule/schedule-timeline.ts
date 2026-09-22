/**
 * La rejilla del Cronograma: minuto <-> pixel dentro de **un** dia (ADR 041).
 * Escala distinta a `gantt-timeline.ts` (dias por pixel, no minutos) a
 * proposito: son dos ejes distintos y forzarlos a compartir modulo mezclaria
 * dos escalas que no tienen nada en comun.
 */

export const PX_PER_MINUTE = 1.4;
export const SNAP_MINUTES = 5;

export function minutesToPx(minutes: number): number {
  return minutes * PX_PER_MINUTE;
}

export function secondsToPx(seconds: number): number {
  return minutesToPx(seconds / 60);
}

export function pxToMinutes(px: number): number {
  return Math.round(px / PX_PER_MINUTE);
}

export function snapMinute(minute: number): number {
  return Math.round(minute / SNAP_MINUTES) * SNAP_MINUTES;
}

export function clampMinute(minute: number, min: number, max: number): number {
  return Math.max(min, Math.min(minute, max));
}

export function formatClock(minute: number): string {
  const hours = Math.floor(minute / 60);
  const mins = minute % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

export function hourMarks(startMinute: number, endMinute: number): number[] {
  const marks: number[] = [];
  const firstHour = Math.ceil(startMinute / 60) * 60;
  for (let minute = firstHour; minute <= endMinute; minute += 60) {
    marks.push(minute);
  }
  return marks;
}
