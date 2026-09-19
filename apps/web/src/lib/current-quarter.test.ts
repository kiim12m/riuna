import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { currentQuarter } from "./current-quarter";

describe("currentQuarter", () => {
  // El fallo solo se ve al este de Greenwich, y CI corre en UTC: la zona se
  // fija aqui para que la prueba falle donde fallaba la aplicacion.
  const original = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = "Europe/Madrid";
  });
  afterAll(() => {
    process.env.TZ = original;
  });

  it("keeps the first and last day of the quarter in local time", () => {
    expect(currentQuarter(new Date(2026, 8, 19, 10))).toEqual({
      start: "2026-07-01",
      end: "2026-09-30",
    });
  });

  it("handles the first and the last quarter of the year", () => {
    expect(currentQuarter(new Date(2026, 0, 1))).toEqual({
      start: "2026-01-01",
      end: "2026-03-31",
    });
    expect(currentQuarter(new Date(2026, 11, 31, 23))).toEqual({
      start: "2026-10-01",
      end: "2026-12-31",
    });
  });
});
