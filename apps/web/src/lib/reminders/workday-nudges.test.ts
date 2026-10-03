import { describe, expect, it } from "vitest";
import {
  BREAK_EVERY_MS,
  type NudgePreferences,
  type WorkdaySchedule,
  workdayNudges,
} from "./workday-nudges";

const minute = 60 * 1000;
/** Viernes 2 de octubre de 2026, hora local. */
const friday = (hours: number, minutes = 0) =>
  new Date(2026, 9, 2, hours, minutes).getTime();
const saturday = (hours: number) => new Date(2026, 9, 3, hours).getTime();

const schedule: WorkdaySchedule = {
  workStartMinute: 9 * 60,
  workEndMinute: 17 * 60,
  lunchEnabled: true,
  lunchStartMinute: 14 * 60,
  lunchEndMinute: 15 * 60,
  workDays: 0b0_111_110,
};
const all: NudgePreferences = { break: true, idle: true, overtime: true };

function nudges(
  overrides: Partial<Parameters<typeof workdayNudges>[0]> & { now: number },
) {
  return workdayNudges({
    schedule,
    running: null,
    lastStoppedAt: null,
    focus: null,
    preferences: all,
    fired: {},
    ...overrides,
  });
}

describe("workdayNudges", () => {
  it("asks for a break after 90 minutes of work in a row, then every 90", () => {
    const since = friday(9);
    const running = { startTime: friday(10), workingSince: since };
    expect(nudges({ now: since + BREAK_EVERY_MS - 1, running })).toEqual([]);

    const first = nudges({ now: since + BREAK_EVERY_MS, running });
    expect(first).toEqual([
      {
        kind: "break",
        key: `nudge:break:${since}:1`,
        workedMs: BREAK_EVERY_MS,
      },
    ]);
    const fired = { [first[0].key]: since + BREAK_EVERY_MS };
    expect(
      nudges({ now: since + BREAK_EVERY_MS + 30 * minute, running, fired }),
    ).toEqual([]);
    expect(
      nudges({ now: since + 2 * BREAK_EVERY_MS, running, fired }).map(
        (nudge) => nudge.key,
      ),
    ).toEqual([`nudge:break:${since}:2`]);
  });

  it("leaves breaks to a focus mode that ends on its own, not to Flowtime", () => {
    const running = { startTime: friday(9), workingSince: friday(9) };
    const now = friday(11);
    expect(
      nudges({ now, running, focus: { mode: "pomodoro", phase: "work" } }),
    ).toEqual([]);
    expect(
      nudges({ now, running, focus: { mode: "countdown", phase: "work" } }),
    ).toEqual([]);
    expect(
      nudges({ now, running, focus: { mode: "flowtime", phase: "work" } }).map(
        (n) => n.kind,
      ),
    ).toEqual(["break"]);
  });

  it("warns once a day when the timer runs past the end of the workday", () => {
    const running = { startTime: friday(16, 30), workingSince: friday(16, 30) };
    expect(nudges({ now: friday(16, 59), running })).toEqual([]);
    const late = nudges({ now: friday(17), running });
    expect(late).toEqual([
      { kind: "overtime", key: "nudge:overtime:2026-10-02" },
    ]);
    expect(
      nudges({ now: friday(17, 30), running, fired: { [late[0].key]: 1 } }),
    ).toEqual([]);
  });

  it("warns about a timer on a day off or left running since an earlier day, not before work starts", () => {
    expect(
      nudges({
        now: saturday(10),
        running: { startTime: saturday(10), workingSince: saturday(10) },
      }).map((n) => n.kind),
    ).toEqual(["overtime"]);
    // Un cronometro olvidado desde ayer, en horario laboral de hoy.
    const forgotten = new Date(2026, 9, 1, 18).getTime();
    expect(
      nudges({
        now: friday(9, 10),
        running: { startTime: forgotten, workingSince: forgotten },
        preferences: { ...all, break: false },
      }),
    ).toEqual([{ kind: "overtime", key: "nudge:overtime:2026-10-02" }]);
    // Empezar antes de la hora no es estar fuera de jornada.
    expect(
      nudges({
        now: friday(8, 30),
        running: { startTime: friday(8), workingSince: friday(8) },
      }),
    ).toEqual([]);
  });

  it("nudges to track only in work hours, after 15 minutes without a timer", () => {
    expect(nudges({ now: friday(9, 14) })).toEqual([]);
    expect(nudges({ now: friday(9, 15) })).toEqual([
      { kind: "idle", key: "nudge:idle:2026-10-02:555" },
    ]);
    expect(nudges({ now: friday(8, 50) })).toEqual([]);
    expect(nudges({ now: friday(17, 10) })).toEqual([]);
    expect(nudges({ now: saturday(11) })).toEqual([]);
  });

  it("counts from the last stop and from the end of lunch, and stays quiet at lunch", () => {
    expect(nudges({ now: friday(11), lastStoppedAt: friday(10, 50) })).toEqual(
      [],
    );
    expect(nudges({ now: friday(14, 30) })).toEqual([]);
    expect(nudges({ now: friday(15, 10) })).toEqual([]);
    expect(nudges({ now: friday(15, 15) }).map((n) => n.kind)).toEqual([
      "idle",
    ]);
  });

  it("nudges to track at most once an hour, and not during a focus break", () => {
    const fired = { "nudge:idle:2026-10-02:600": friday(10) };
    expect(nudges({ now: friday(10, 59), fired })).toEqual([]);
    expect(nudges({ now: friday(11), fired }).map((n) => n.kind)).toEqual([
      "idle",
    ]);
    const focus = (phase: "short-break" | "ready") => ({
      mode: "pomodoro" as const,
      phase,
    });
    expect(nudges({ now: friday(11), focus: focus("short-break") })).toEqual(
      [],
    );
    // Lista para otro bloque, o con la sesion olvidada: ya no es descanso.
    expect(
      nudges({ now: friday(11), focus: focus("ready") }).map((n) => n.kind),
    ).toEqual(["idle"]);
  });

  it("does not nudge to track on a holiday or an absence, but still warns about a timer left running", () => {
    expect(nudges({ now: friday(11), dayOff: true })).toEqual([]);
    expect(
      nudges({
        now: friday(11),
        dayOff: true,
        running: { startTime: friday(10, 30), workingSince: friday(10, 30) },
      }).map((n) => n.kind),
    ).toEqual(["overtime"]);
  });

  it("respects each preference on its own", () => {
    const running = { startTime: friday(15), workingSince: friday(15) };
    const now = friday(17, 30);
    expect(
      nudges({ now, running, preferences: { ...all, overtime: false } }).map(
        (n) => n.kind,
      ),
    ).toEqual(["break"]);
    expect(
      nudges({ now, running, preferences: { ...all, break: false } }).map(
        (n) => n.kind,
      ),
    ).toEqual(["overtime"]);
    expect(
      nudges({
        now: friday(11),
        preferences: { break: true, idle: false, overtime: true },
      }),
    ).toEqual([]);
  });
});
