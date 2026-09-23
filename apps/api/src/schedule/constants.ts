/**
 * Jornada fija de instancia (08:00-18:00), sin ajuste por persona todavia
 * (ADR 041, mismo aplazamiento que la capacidad de 8 h del Planificador).
 */
export const WORK_START_MINUTE = 8 * 60;
export const WORK_END_MINUTE = 18 * 60;

/** Igual que `SCHEDULE_TASK_MIN_DURATION_IN_MS` de super-productivity: nunca un tramo de ancho cero. */
export const MIN_ENTRY_DURATION_SECONDS = 10 * 60;

/**
 * Una tarea sin estimacion ocupa media hora en el reparto, no el minimo de 10:
 * a 10 min el tramo mide 14 px y no se lee. Es un hueco visible para algo cuya
 * duracion nadie ha dicho todavia, no una estimacion inventada -`task.estimate`
 * sigue nulo y la web lo pinta punteado para que se note.
 */
export const UNESTIMATED_ENTRY_SECONDS = 30 * 60;
