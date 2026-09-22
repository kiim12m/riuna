import { describe, expect, it } from "vitest";
import { getDueWindow } from "./due-window";

// Hora local y no UTC, igual que la funcion: `setHours` opera en la zona del
// entorno que ejecuta el codigo, no en UTC.
const NOW = new Date(2026, 8, 22, 9, 0, 0);

describe("getDueWindow", () => {
  it("has no window without a due date", () => {
    expect(getDueWindow(null, NOW)).toBe("none");
  });

  it("is overdue strictly before today", () => {
    expect(getDueWindow(new Date(2026, 8, 21, 23, 59, 59), NOW)).toBe(
      "overdue",
    );
  });

  it("is today for any hour of the current day", () => {
    expect(getDueWindow(new Date(2026, 8, 22, 0, 0, 0), NOW)).toBe("today");
    expect(getDueWindow(new Date(2026, 8, 22, 23, 0, 0), NOW)).toBe("today");
  });

  it("is week for the six days after today", () => {
    expect(getDueWindow(new Date(2026, 8, 23, 0, 0, 0), NOW)).toBe("week");
    expect(getDueWindow(new Date(2026, 8, 28, 23, 59, 59), NOW)).toBe("week");
  });

  it("is later from the eighth day on", () => {
    expect(getDueWindow(new Date(2026, 8, 29, 0, 0, 0), NOW)).toBe("later");
  });
});
