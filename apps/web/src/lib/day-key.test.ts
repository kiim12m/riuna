import { describe, expect, it } from "vitest";
import { dayKey, parseDayKey } from "./day-key";

describe("dayKey / parseDayKey", () => {
  it("round-trips a local date without touching UTC", () => {
    const date = new Date(2026, 8, 23); // 23 sept 2026
    expect(dayKey(date)).toBe("2026-09-23");
    expect(parseDayKey("2026-09-23")).toEqual(date);
  });
});
