/**
 * Jornada fija de instancia (08:00-18:00), sin ajuste por persona todavia
 * (ADR 041, mismo aplazamiento que la capacidad de 8 h del Planificador).
 */
export const WORK_START_MINUTE = 8 * 60;
export const WORK_END_MINUTE = 18 * 60;

/** Igual que `SCHEDULE_TASK_MIN_DURATION_IN_MS` de super-productivity: nunca un tramo de ancho cero. */
export const MIN_ENTRY_DURATION_SECONDS = 10 * 60;
