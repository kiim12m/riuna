import { describe, expect, it } from "vitest";
import { WorkCalendar } from "../../../apps/api/src/task/schedule/work-calendar";
import { serverDayKey } from "../../../apps/api/src/utils/day-boundaries";

// Octubre de 2026: el lunes 12 es festivo (Hispanidad).
const day = (date: number, month = 10) => new Date(2026, month - 1, date);
const key = (date: Date) => serverDayKey(date);
const calendar = new WorkCalendar(new Set(["2026-10-12"]));

describe("WorkCalendar", () => {
  it("works Monday to Friday and skips the workspace holidays", () => {
    expect(calendar.isWorkDay(day(9))).toBe(true); // viernes
    expect(calendar.isWorkDay(day(10))).toBe(false); // sabado
    expect(calendar.isWorkDay(day(12))).toBe(false); // festivo
    expect(calendar.isWorkDay(day(13))).toBe(true);
  });

  it("finds the next working day across a weekend and a holiday", () => {
    expect(key(calendar.nextWorkDay(day(9)))).toBe("2026-10-13");
  });

  it("adds and subtracts working days", () => {
    expect(key(calendar.addWorkDays(day(9), 1))).toBe("2026-10-13");
    expect(key(calendar.addWorkDays(day(13), -1))).toBe("2026-10-09");
    expect(key(calendar.addWorkDays(day(14), 0))).toBe("2026-10-14");
    // Desde un sabado, el primer paso ya es el lunes laborable.
    expect(key(calendar.addWorkDays(day(10), 2))).toBe("2026-10-14");
  });

  it("counts working days with both ends included", () => {
    expect(calendar.workDaysBetween(day(9), day(16))).toBe(5);
    expect(calendar.workDaysBetween(day(14), day(14))).toBe(1);
    expect(calendar.workDaysBetween(day(16), day(14))).toBe(0);
  });

  it("counts how many working days separate two days, either way", () => {
    expect(calendar.workDaysToward(day(9), day(14))).toBe(2);
    expect(calendar.workDaysToward(day(14), day(9))).toBe(-2);
    // Soltar en un sabado cuenta hasta el viernes.
    expect(calendar.workDaysToward(day(7), day(10))).toBe(2);
    expect(calendar.workDaysToward(day(9), day(9))).toBe(0);
  });

  it("keeps midnight across the end of summer time", () => {
    // El 25 de octubre Madrid pasa de UTC+2 a UTC+1.
    const next = calendar.addWorkDays(day(23), 1);
    expect(key(next)).toBe("2026-10-26");
    expect(next.getHours()).toBe(0);
  });
});
