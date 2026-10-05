import { describe, expect, it } from "vitest";
import { dayKey, parseDayKey } from "@/lib/day-key";
import { headerTitle, rangeFor, shiftAnchor } from "./schedule-range";

describe("rangeFor", () => {
  it("day view is a single day", () => {
    const anchor = new Date(2026, 8, 23);
    const range = rangeFor("day", anchor, 1);
    expect(range.days).toBe(1);
    expect(range.dayKeys).toEqual(["2026-09-23"]);
  });

  it("week view starts on weekStartsOn and spans 7 days", () => {
    const anchor = new Date(2026, 8, 23); // wednesday
    const monday = rangeFor("week", anchor, 1);
    expect(monday.dayKeys[0]).toBe("2026-09-21");
    expect(monday.dayKeys).toHaveLength(7);
    expect(monday.dayKeys.at(-1)).toBe("2026-09-27");

    const sunday = rangeFor("week", anchor, 0);
    expect(sunday.dayKeys[0]).toBe("2026-09-20");
  });

  it("month view covers whole weeks around the month, grouped", () => {
    const anchor = new Date(2026, 8, 23); // september 2026
    const range = rangeFor("month", anchor, 1);
    expect(range.weeks?.length).toBeGreaterThanOrEqual(5);
    expect(range.dayKeys[0]).toBe(range.weeks?.[0]?.[0]);
    expect(range.days).toBe(range.dayKeys.length);
    // First day of the grid is on or before the 1st of the month.
    expect(
      parseDayKey(range.dayKeys[0] as string).getTime(),
    ).toBeLessThanOrEqual(new Date(2026, 8, 1).getTime());
  });

  it("month view crossing a year boundary stays consistent", () => {
    const anchor = new Date(2026, 0, 5); // january 2026
    const range = rangeFor("month", anchor, 1);
    expect(range.dayKeys.every((key) => /^\d{4}-\d{2}-\d{2}$/.test(key))).toBe(
      true,
    );
  });
});

describe("shiftAnchor", () => {
  it("moves by one day, week or month depending on the view", () => {
    const anchor = new Date(2026, 8, 23);
    expect(dayKey(shiftAnchor("day", anchor, 1))).toBe("2026-09-24");
    expect(dayKey(shiftAnchor("day", anchor, -1))).toBe("2026-09-22");
    expect(dayKey(shiftAnchor("week", anchor, 1))).toBe("2026-09-30");
    expect(dayKey(shiftAnchor("month", anchor, 1))).toBe("2026-10-23");
    expect(dayKey(shiftAnchor("month", anchor, -1))).toBe("2026-08-23");
  });
});

describe("headerTitle", () => {
  it("day view returns a formatted label", () => {
    const title = headerTitle("day", new Date(2026, 8, 23), 1, "es-ES");
    expect(title.view).toBe("day");
    if (title.view === "day") {
      expect(title.label.length).toBeGreaterThan(0);
    }
  });

  it("week view returns the ISO week number and a range string", () => {
    const title = headerTitle("week", new Date(2026, 8, 23), 1, "es-ES");
    expect(title.view).toBe("week");
    if (title.view === "week") {
      expect(title.weekNumber).toBe(39);
      expect(title.range.length).toBeGreaterThan(0);
    }
  });

  it("month view returns a formatted month/year label", () => {
    const title = headerTitle("month", new Date(2026, 8, 23), 1, "es-ES");
    expect(title.view).toBe("month");
    if (title.view === "month") {
      expect(title.label.length).toBeGreaterThan(0);
    }
  });
});
