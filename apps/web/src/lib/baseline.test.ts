import { describe, expect, it } from "vitest";
import { baselineDayKey, isBaselineChoice } from "./baseline";

describe("baselineDayKey", () => {
  it("counts back from today", () => {
    expect(baselineDayKey("yesterday", "2026-10-13")).toBe("2026-10-12");
    expect(baselineDayKey("week", "2026-10-13")).toBe("2026-10-06");
    expect(baselineDayKey("2026-09-01", "2026-10-13")).toBe("2026-09-01");
  });

  it("skips the weekend and the holidays for the last work day", () => {
    // Lunes 19: el ultimo laborable es el viernes 16.
    expect(baselineDayKey("lastWorkDay", "2026-10-19")).toBe("2026-10-16");
    // Martes 13 con el lunes 12 festivo: el viernes 9.
    expect(
      baselineDayKey("lastWorkDay", "2026-10-13", new Set(["2026-10-12"])),
    ).toBe("2026-10-09");
  });
});

describe("isBaselineChoice", () => {
  it("accepts the presets and a day, nothing else", () => {
    expect(isBaselineChoice("yesterday")).toBe(true);
    expect(isBaselineChoice("2026-10-01")).toBe(true);
    expect(isBaselineChoice("tomorrow")).toBe(false);
    expect(isBaselineChoice(7)).toBe(false);
  });
});
