import { describe, expect, it } from "vitest";
import { nextWorkDayKey, unavailableDayKeys } from "./work-days";

const MONDAY_TO_FRIDAY = 0b0_111_110;

describe("nextWorkDayKey", () => {
  it("skips the weekend from a Friday", () => {
    // Viernes 2 de octubre de 2026.
    expect(nextWorkDayKey("2026-10-02", MONDAY_TO_FRIDAY)).toBe("2026-10-05");
  });

  it("is the next day midweek", () => {
    expect(nextWorkDayKey("2026-10-06", MONDAY_TO_FRIDAY)).toBe("2026-10-07");
  });

  it("crosses a month and the clock change", () => {
    expect(nextWorkDayKey("2026-10-24", MONDAY_TO_FRIDAY)).toBe("2026-10-26");
    expect(nextWorkDayKey("2026-10-30", MONDAY_TO_FRIDAY)).toBe("2026-11-02");
  });

  it("falls back to the next day with no work days", () => {
    expect(nextWorkDayKey("2026-10-02", 0)).toBe("2026-10-03");
  });
});

describe("nextWorkDayKey with unavailable days", () => {
  it("skips a holiday", () => {
    // Jueves 8 de octubre festivo: de miercoles 7 se pasa al viernes.
    expect(
      nextWorkDayKey("2026-10-07", MONDAY_TO_FRIDAY, new Set(["2026-10-08"])),
    ).toBe("2026-10-09");
  });

  it("skips a holiday that follows the weekend", () => {
    expect(
      nextWorkDayKey("2026-10-02", MONDAY_TO_FRIDAY, new Set(["2026-10-05"])),
    ).toBe("2026-10-06");
  });

  it("skips an absence of several days", () => {
    const week = new Set(["2026-10-05", "2026-10-06", "2026-10-07"]);
    expect(nextWorkDayKey("2026-10-02", MONDAY_TO_FRIDAY, week)).toBe(
      "2026-10-08",
    );
  });

  it("ignores a holiday that falls on a weekend", () => {
    // Un festivo en sabado no cambia nada.
    expect(
      nextWorkDayKey("2026-10-02", MONDAY_TO_FRIDAY, new Set(["2026-10-03"])),
    ).toBe("2026-10-05");
  });
});

describe("unavailableDayKeys", () => {
  it("includes both ends of an absence and the holidays", () => {
    const keys = unavailableDayKeys(
      [{ day: new Date(2026, 11, 25).toISOString() }],
      [
        {
          startsOn: new Date(2026, 9, 5).toISOString(),
          endsOn: new Date(2026, 9, 7).toISOString(),
        },
      ],
    );
    expect([...keys].sort()).toEqual([
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
      "2026-12-25",
    ]);
  });
});
