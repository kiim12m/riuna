/**
 * La rejilla del Cronograma: minuto <-> pixel dentro de **un** dia (ADR 041).
 * Escala distinta a `gantt-timeline.ts` (dias por pixel, no minutos) a
 * proposito: son dos ejes distintos y forzarlos a compartir modulo mezclaria
 * dos escalas que no tienen nada en comun.
 */

export const PX_PER_MINUTE = 1.4;
export const SNAP_MINUTES = 5;
/** Snap para crear con el raton (`create-task-placeholder.tsx`): 15 min es
 * mas comodo a golpe de clic que los 5 min del arrastre para anclar. */
export const CREATE_SNAP_MINUTES = 15;

export function minutesToPx(minutes: number): number {
  return minutes * PX_PER_MINUTE;
}

export function secondsToPx(seconds: number): number {
  return minutesToPx(seconds / 60);
}

export function pxToMinutes(px: number): number {
  return Math.round(px / PX_PER_MINUTE);
}

export function snapMinute(minute: number, step = SNAP_MINUTES): number {
  return Math.round(minute / step) * step;
}

/** El minuto del dia bajo `offsetY` dentro de una rejilla que arranca en
 * `gridStart`, redondeado a `CREATE_SNAP_MINUTES`. */
export function minuteAtOffset(offsetY: number, gridStart: number): number {
  return gridStart + snapMinute(pxToMinutes(offsetY), CREATE_SNAP_MINUTES);
}

export function clampMinute(minute: number, min: number, max: number): number {
  return Math.max(min, Math.min(minute, max));
}

export function formatClock(minute: number): string {
  const hours = Math.floor(minute / 60);
  const mins = minute % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

export const MIN_SEGMENT_DURATION_MINUTES = 10;
/** Espejo de `UNESTIMATED_ENTRY_SECONDS` (`apps/api/src/schedule/constants.ts`):
 * la base sobre la que sumar el delta al redimensionar una tarea sin
 * estimar -es la duracion que el usuario ya esta viendo y arrastrando. */
export const UNESTIMATED_ENTRY_SECONDS = 30 * 60;

export type ResizeEdge = "top" | "bottom";

export type ResizeResult = {
  startMinute: number;
  durationMinutes: number;
};

/**
 * Nueva posicion/duracion de un tramo al arrastrar uno de sus bordes
 * (`segment-card.tsx`). El borde inferior solo cambia la duracion; la
 * superior mueve el inicio y mantiene fijo el final -arrastrar hacia arriba
 * adelanta la tarea sin alargarla, hacia abajo la retrasa sin acortarla-.
 */
export function resizeSegment(
  edge: ResizeEdge,
  startMinute: number,
  durationMinutes: number,
  deltaPx: number,
  bounds: { min: number; max: number },
): ResizeResult {
  const deltaMinutes = snapMinute(pxToMinutes(deltaPx));

  if (edge === "bottom") {
    const maxDuration = bounds.max - startMinute;
    const nextDuration = clampMinute(
      durationMinutes + deltaMinutes,
      MIN_SEGMENT_DURATION_MINUTES,
      maxDuration,
    );
    return { startMinute, durationMinutes: nextDuration };
  }

  const endMinute = startMinute + durationMinutes;
  const nextStart = clampMinute(
    startMinute + deltaMinutes,
    bounds.min,
    endMinute - MIN_SEGMENT_DURATION_MINUTES,
  );
  return { startMinute: nextStart, durationMinutes: endMinute - nextStart };
}

export function hourMarks(startMinute: number, endMinute: number): number[] {
  const marks: number[] = [];
  const firstHour = Math.ceil(startMinute / 60) * 60;
  for (let minute = firstHour; minute <= endMinute; minute += 60) {
    marks.push(minute);
  }
  return marks;
}
