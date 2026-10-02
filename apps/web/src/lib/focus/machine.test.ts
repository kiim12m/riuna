import { describe, expect, it } from "vitest";
import {
  advance,
  finishBreak,
  finishWork,
  nextWork,
  POMODORO,
  remainingMs,
  startFocus,
} from "./machine";

const MINUTE = 60 * 1000;
const t0 = 1_000_000;

describe("focus machine: pomodoro", () => {
  it("works 25 minutes, then rests 5", () => {
    const session = startFocus({ mode: "pomodoro", taskId: "t", now: t0 });
    expect(remainingMs(session, t0 + MINUTE)).toBe(24 * MINUTE);
    expect(advance(session, t0 + 24 * MINUTE)).toBe(session);

    const rest = advance(session, t0 + 25 * MINUTE + 1);
    expect(rest).toMatchObject({
      phase: "short-break",
      phaseStartedAt: t0 + 25 * MINUTE,
      phaseDurationMs: 5 * MINUTE,
      completedWork: 1,
    });
  });

  it("takes the long break every fourth block", () => {
    let session = startFocus({ mode: "pomodoro", taskId: "t", now: t0 });
    const phases: string[] = [];
    let now = t0;
    for (let block = 0; block < 4; block++) {
      now += POMODORO.workMs;
      session = finishWork(session, now);
      phases.push(session.phase);
      now += session.phaseDurationMs ?? 0;
      session = nextWork(finishBreak(session, now), now);
    }
    expect(phases).toEqual([
      "short-break",
      "short-break",
      "short-break",
      "long-break",
    ]);
  });

  it("waits, ready, after a break instead of starting work alone", () => {
    const session = finishWork(
      startFocus({ mode: "pomodoro", taskId: "t", now: t0 }),
      t0 + 25 * MINUTE,
    );
    const ready = advance(session, t0 + 31 * MINUTE);
    expect(ready).toMatchObject({
      phase: "ready",
      phaseStartedAt: t0 + 30 * MINUTE,
      phaseDurationMs: null,
    });
    expect(advance(ready, t0 + 99 * MINUTE)).toBe(ready);
  });

  it("dates a late check at the moment the phase really ended", () => {
    const session = startFocus({ mode: "pomodoro", taskId: "t", now: t0 });
    expect(advance(session, t0 + 26 * MINUTE).phaseStartedAt).toBe(
      t0 + 25 * MINUTE,
    );
  });
});

describe("focus machine: flowtime", () => {
  it("has no end while working and rests a fifth of what was worked", () => {
    const session = startFocus({ mode: "flowtime", taskId: "t", now: t0 });
    expect(remainingMs(session, t0 + 90 * MINUTE)).toBeNull();
    expect(advance(session, t0 + 90 * MINUTE)).toBe(session);

    expect(finishWork(session, t0 + 50 * MINUTE).phaseDurationMs).toBe(
      10 * MINUTE,
    );
  });

  it("keeps the break between one and thirty minutes", () => {
    const session = startFocus({ mode: "flowtime", taskId: "t", now: t0 });
    expect(finishWork(session, t0 + 2 * MINUTE).phaseDurationMs).toBe(MINUTE);
    expect(finishWork(session, t0 + 300 * MINUTE).phaseDurationMs).toBe(
      30 * MINUTE,
    );
  });

  it("starts the next block open-ended again", () => {
    const rested = finishBreak(
      finishWork(
        startFocus({ mode: "flowtime", taskId: "t", now: t0 }),
        t0 + 40 * MINUTE,
      ),
      t0 + 48 * MINUTE,
    );
    expect(nextWork(rested, t0 + 50 * MINUTE)).toMatchObject({
      phase: "work",
      phaseDurationMs: null,
      completedWork: 1,
    });
  });
});

describe("focus machine: countdown", () => {
  it("runs the chosen minutes and is done, without a break", () => {
    const session = startFocus({
      mode: "countdown",
      taskId: "t",
      now: t0,
      countdownMs: 45 * MINUTE,
    });
    expect(remainingMs(session, t0)).toBe(45 * MINUTE);
    expect(advance(session, t0 + 45 * MINUTE)).toMatchObject({
      phase: "done",
      completedWork: 1,
      phaseDurationMs: null,
    });
  });

  it("can run again with the same length", () => {
    const done = finishWork(
      startFocus({
        mode: "countdown",
        taskId: "t",
        now: t0,
        countdownMs: 10 * MINUTE,
      }),
      t0 + 10 * MINUTE,
    );
    expect(nextWork(done, t0 + 11 * MINUTE).phaseDurationMs).toBe(10 * MINUTE);
  });
});
