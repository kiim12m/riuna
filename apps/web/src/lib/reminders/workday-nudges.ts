import { type FocusSession, isBreak } from "@/lib/focus/machine";

/**
 * Avisos de ritmo (ADR 056): tres reglas puras sobre la jornada personal
 * (ADR 045) y el cronometro (ADR 044). Quien las llama decide si avisa; aqui
 * solo se decide que toca, con una clave para no repetirlo.
 *
 * - **Descanso**: tras `BREAK_EVERY_MS` de trabajo seguido -en cadena de
 *   entradas, aunque se cambie de tarea-, y otra vez cada tanto. Un bloque
 *   de foco con fin propio (Pomodoro, cuenta atras) ya marca sus descansos.
 * - **Sin registrar**: en horario laboral, sin cronometro desde hace
 *   `IDLE_AFTER_MS`, como mucho una vez cada `IDLE_REPEAT_MS`. Ni en la
 *   comida ni en un descanso del modo foco, que para el cronometro a
 *   proposito, ni en un festivo o una ausencia (ADR 060).
 * - **Fuera de jornada**: el cronometro sigue en marcha pasada la hora de
 *   salida, en un dia no laborable o desde un dia anterior. Una vez al dia.
 */

export const BREAK_EVERY_MS = 90 * 60 * 1000;
export const IDLE_AFTER_MS = 15 * 60 * 1000;
export const IDLE_REPEAT_MS = 60 * 60 * 1000;

export type NudgeKind = "break" | "idle" | "overtime";

export type NudgePreferences = Record<NudgeKind, boolean>;

export type WorkdaySchedule = {
  workStartMinute: number;
  workEndMinute: number;
  lunchEnabled: boolean;
  lunchStartMinute: number | null;
  lunchEndMinute: number | null;
  workDays: number;
};

export type Nudge =
  | { kind: "break"; key: string; workedMs: number }
  | { kind: "idle"; key: string }
  | { kind: "overtime"; key: string };

function dayKeyOf(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** El instante de hoy a `minute` minutos de la medianoche local. */
function atMinute(today: Date, minute: number) {
  const at = new Date(today);
  at.setHours(0, minute, 0, 0);
  return at.getTime();
}

export function workdayNudges({
  now,
  schedule,
  running,
  lastStoppedAt,
  focus,
  dayOff = false,
  preferences,
  fired,
}: {
  now: number;
  schedule: WorkdaySchedule;
  running: { startTime: number; workingSince: number } | null;
  /** Sin nada en marcha, cuando acabo la ultima entrada. */
  lastStoppedAt: number | null;
  /** La sesion de foco abierta, si hay alguna. */
  focus: Pick<FocusSession, "mode" | "phase"> | null;
  /** Hoy es festivo o hay una ausencia: no es dia de trabajo. */
  dayOff?: boolean;
  preferences: NudgePreferences;
  /** Lo ya avisado, con cuando, como lo guarda `readFiredTimes()`. */
  fired: Record<string, number>;
}): Nudge[] {
  const today = new Date(now);
  const dayKey = dayKeyOf(today);
  const minute = today.getHours() * 60 + today.getMinutes();
  const workDay = !dayOff && ((schedule.workDays >> today.getDay()) & 1) === 1;
  const lunch =
    schedule.lunchEnabled &&
    schedule.lunchStartMinute !== null &&
    schedule.lunchEndMinute !== null
      ? { start: schedule.lunchStartMinute, end: schedule.lunchEndMinute }
      : null;
  const atLunch = lunch !== null && minute >= lunch.start && minute < lunch.end;
  const inWorkHours =
    workDay &&
    minute >= schedule.workStartMinute &&
    minute < schedule.workEndMinute &&
    !atLunch;

  const nudges: Nudge[] = [];

  // Solo mientras se trabaja en un bloque que acaba solo: una sesion
  // olvidada en «lista» o «terminada» no marca ningun descanso.
  const focusEndsOnItsOwn =
    focus?.phase === "work" &&
    (focus.mode === "pomodoro" || focus.mode === "countdown");
  if (running && preferences.break && !focusEndsOnItsOwn) {
    const workedMs = now - running.workingSince;
    const round = Math.floor(workedMs / BREAK_EVERY_MS);
    const key = `nudge:break:${running.workingSince}:${round}`;
    if (round >= 1 && !(key in fired)) {
      nudges.push({ kind: "break", key, workedMs });
    }
  }

  if (running && preferences.overtime) {
    const fromEarlierDay = dayKeyOf(new Date(running.startTime)) !== dayKey;
    const key = `nudge:overtime:${dayKey}`;
    if (
      (!workDay || minute >= schedule.workEndMinute || fromEarlierDay) &&
      !(key in fired)
    ) {
      nudges.push({ kind: "overtime", key });
    }
  }

  if (
    !running &&
    preferences.idle &&
    inWorkHours &&
    !(focus && isBreak(focus.phase))
  ) {
    // Se cuenta desde lo ultimo que pasara: la entrada de la jornada, la
    // vuelta de la comida o la ultima parada.
    const since = Math.max(
      lastStoppedAt ?? 0,
      atMinute(today, schedule.workStartMinute),
      lunch !== null && minute >= lunch.end ? atMinute(today, lunch.end) : 0,
    );
    const lastIdle = Math.max(
      0,
      ...Object.entries(fired)
        .filter(([key]) => key.startsWith("nudge:idle:"))
        .map(([, at]) => at),
    );
    if (now - since >= IDLE_AFTER_MS && now - lastIdle >= IDLE_REPEAT_MS) {
      nudges.push({ kind: "idle", key: `nudge:idle:${dayKey}:${minute}` });
    }
  }

  return nudges;
}
