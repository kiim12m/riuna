import { describe, expect, it } from "vitest";
import {
  reminderFromInputs,
  reminderPresetDate,
} from "./task-reminder-presets";

// Lunes 12 de octubre de 2026 a las 13:40, hora de Madrid (TZ del vitest).
const monday = new Date(2026, 9, 12, 13, 40);
const friday = new Date(2026, 9, 16, 18, 0);

function local(date: Date) {
  return [
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
  ];
}

describe("reminderPresetDate", () => {
  it("puts tomorrow at nine in the morning", () => {
    expect(local(reminderPresetDate("tomorrow", monday))).toEqual([
      2026, 10, 13, 9, 0,
    ]);
  });

  it("never takes today as the next Monday", () => {
    expect(local(reminderPresetDate("nextMonday", monday))).toEqual([
      2026, 10, 19, 9, 0,
    ]);
    expect(local(reminderPresetDate("nextMonday", friday))).toEqual([
      2026, 10, 19, 9, 0,
    ]);
  });

  it("counts a week as seven calendar days", () => {
    expect(local(reminderPresetDate("inAWeek", friday))).toEqual([
      2026, 10, 23, 9, 0,
    ]);
  });

  it("keeps nine o'clock across the end of summer time", () => {
    // El 25 de octubre de 2026 Madrid pasa de UTC+2 a UTC+1.
    const saturday = new Date(2026, 9, 24, 20, 0);
    const date = reminderPresetDate("tomorrow", saturday);
    expect(local(date)).toEqual([2026, 10, 25, 9, 0]);
    expect(date.toISOString()).toBe("2026-10-25T08:00:00.000Z");
  });
});

describe("reminderFromInputs", () => {
  it("reads the date and time fields as local time", () => {
    expect(reminderFromInputs("2026-10-15", "09:30")?.toISOString()).toBe(
      "2026-10-15T07:30:00.000Z",
    );
  });

  it("rejects incomplete fields", () => {
    expect(reminderFromInputs("", "09:30")).toBeNull();
    expect(reminderFromInputs("2026-10-15", "")).toBeNull();
  });
});
