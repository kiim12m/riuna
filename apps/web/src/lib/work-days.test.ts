import { describe, expect, it } from "vitest";
import { nextWorkDayKey } from "./work-days";

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
