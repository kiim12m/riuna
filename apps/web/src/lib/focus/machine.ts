/**
 * El modo foco (ADR 056) como maquina pura: fases, duraciones y transiciones,
 * sin reloj ni efectos. El reloj lo pone quien llama; arrancar y parar el
 * cronometro, tambien.
 *
 * - Pomodoro: 25 min de trabajo, 5 de descanso y 15 cada cuatro.
 * - Flowtime: se trabaja hasta que se decide parar, y el descanso es el 20 %
 *   de lo trabajado.
 * - Cuenta atras: un bloque de N minutos y se acaba.
 *
 * Tras un descanso la sesion queda `ready`: el siguiente bloque empieza
 * cuando se pulsa, para no registrar tiempo de alguien que no ha vuelto.
 */

export type FocusMode = "pomodoro" | "flowtime" | "countdown";

export type FocusPhase =
  | "work"
  | "short-break"
  | "long-break"
  | "ready"
  | "done";

export type FocusSession = {
  mode: FocusMode;
  taskId: string;
  phase: FocusPhase;
  /** Cuando empezo la fase actual (ms). */
  phaseStartedAt: number;
  /** Lo que dura la fase; `null` si no tiene final: Flowtime trabajando, listo, hecho. */
  phaseDurationMs: number | null;
  /** Bloques de trabajo terminados en esta sesion. */
  completedWork: number;
  /** Solo la cuenta atras: lo que dura su bloque. */
  countdownMs: number | null;
};

const MINUTE = 60 * 1000;

export const POMODORO = {
  workMs: 25 * MINUTE,
  shortBreakMs: 5 * MINUTE,
  longBreakMs: 15 * MINUTE,
  longEvery: 4,
} as const;

export const FLOWTIME_BREAK_RATIO = 0.2;
export const FLOWTIME_BREAK_MIN_MS = MINUTE;
export const FLOWTIME_BREAK_MAX_MS = 30 * MINUTE;

function workDuration(mode: FocusMode, countdownMs: number | null) {
  if (mode === "pomodoro") return POMODORO.workMs;
  if (mode === "countdown") return countdownMs ?? 25 * MINUTE;
  return null;
}

export function startFocus({
  mode,
  taskId,
  now,
  countdownMs = null,
}: {
  mode: FocusMode;
  taskId: string;
  now: number;
  countdownMs?: number | null;
}): FocusSession {
  return {
    mode,
    taskId,
    phase: "work",
    phaseStartedAt: now,
    phaseDurationMs: workDuration(mode, countdownMs),
    completedWork: 0,
    countdownMs: mode === "countdown" ? countdownMs : null,
  };
}

export function phaseEndsAt(session: FocusSession): number | null {
  return session.phaseDurationMs === null
    ? null
    : session.phaseStartedAt + session.phaseDurationMs;
}

/** Lo que falta de la fase, o `null` si no tiene final. */
export function remainingMs(session: FocusSession, now: number) {
  const ends = phaseEndsAt(session);
  return ends === null ? null : Math.max(0, ends - now);
}

export function elapsedMs(session: FocusSession, now: number) {
  return Math.max(0, now - session.phaseStartedAt);
}

export function isBreak(phase: FocusPhase) {
  return phase === "short-break" || phase === "long-break";
}

/** Termina el bloque de trabajo -por tiempo o a mano- y pasa a lo que toque. */
export function finishWork(session: FocusSession, now: number): FocusSession {
  const completedWork = session.completedWork + 1;

  if (session.mode === "countdown") {
    return {
      ...session,
      phase: "done",
      phaseStartedAt: now,
      phaseDurationMs: null,
      completedWork,
    };
  }

  if (session.mode === "pomodoro") {
    const long = completedWork % POMODORO.longEvery === 0;
    return {
      ...session,
      phase: long ? "long-break" : "short-break",
      phaseStartedAt: now,
      phaseDurationMs: long ? POMODORO.longBreakMs : POMODORO.shortBreakMs,
      completedWork,
    };
  }

  const worked = elapsedMs(session, now);
  return {
    ...session,
    phase: "short-break",
    phaseStartedAt: now,
    phaseDurationMs: Math.min(
      FLOWTIME_BREAK_MAX_MS,
      Math.max(
        FLOWTIME_BREAK_MIN_MS,
        Math.round(worked * FLOWTIME_BREAK_RATIO),
      ),
    ),
    completedWork,
  };
}

/** Termina el descanso: lista para el siguiente bloque, sin empezarlo. */
export function finishBreak(session: FocusSession, now: number): FocusSession {
  return {
    ...session,
    phase: "ready",
    phaseStartedAt: now,
    phaseDurationMs: null,
  };
}

/** Empieza el siguiente bloque de trabajo, desde un descanso o desde listo. */
export function nextWork(session: FocusSession, now: number): FocusSession {
  return {
    ...session,
    phase: "work",
    phaseStartedAt: now,
    phaseDurationMs: workDuration(session.mode, session.countdownMs),
  };
}

/**
 * Lo que el paso del tiempo cambia solo: un bloque con final que llego a su
 * hora pasa al descanso, y un descanso que acabo queda listo. La transicion
 * se fecha cuando tocaba, no cuando se comprobo: una pestaña en segundo plano
 * puede mirar con un minuto de retraso.
 */
export function advance(session: FocusSession, now: number): FocusSession {
  const ends = phaseEndsAt(session);
  if (ends === null || ends > now) return session;
  if (session.phase === "work") return finishWork(session, ends);
  if (isBreak(session.phase)) return finishBreak(session, ends);
  return session;
}
