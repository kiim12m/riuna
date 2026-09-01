import { describe, expect, it } from "vitest";
import {
  formatSheetDate,
  formatSheetDateIso,
  parseSheetDate,
  toSheetDate,
} from "../../../../apps/api/src/task/exchange/sheet-dates";

// La conversion de fechas de las hojas, que la plantilla de SERVITEC descubrio y
// el motor de intercambio absorbio (ADR 017). Lo que vigila: el dia se corta en
// Madrid y no en la zona del contenedor, y la celda cae en la medianoche UTC de
// ese dia para que ExcelJS no arrastre una hora escondida.

describe("formatSheetDate", () => {
  it("cuts the day in Madrid, not in UTC", () => {
    // 00:30 del 18 en Madrid, todavia el 17 en UTC. La hoja se lee en Madrid.
    expect(formatSheetDate(new Date("2026-08-17T22:30:00Z"))).toBe(
      "18/08/2026",
    );
    expect(formatSheetDateIso(new Date("2026-08-17T22:30:00Z"))).toBe(
      "2026-08-18",
    );
  });

  it("handles a winter date, when the offset is one hour", () => {
    expect(formatSheetDate(new Date("2026-01-15T23:30:00Z"))).toBe(
      "16/01/2026",
    );
    expect(formatSheetDate(new Date("2026-01-15T22:30:00Z"))).toBe(
      "15/01/2026",
    );
  });
});

describe("toSheetDate", () => {
  it("lands on UTC midnight of the Madrid day", () => {
    expect(toSheetDate(new Date("2026-05-29T08:00:00Z"))).toEqual(
      new Date(Date.UTC(2026, 4, 29)),
    );
    // Cruzando medianoche en Madrid: el 17 en UTC es ya el 18 en la hoja.
    expect(toSheetDate(new Date("2026-08-17T22:30:00Z"))).toEqual(
      new Date(Date.UTC(2026, 7, 18)),
    );
  });

  it("passes null through", () => {
    expect(toSheetDate(null)).toBeNull();
  });
});

describe("parseSheetDate", () => {
  it("reads ISO and the Spanish notation a sheet of this office produces", () => {
    expect(parseSheetDate("2026-08-30")).toEqual(
      new Date(Date.UTC(2026, 7, 30)),
    );
    expect(parseSheetDate("30/08/2026")).toEqual(
      new Date(Date.UTC(2026, 7, 30)),
    );
    expect(parseSheetDate("5-9-2026")).toEqual(new Date(Date.UTC(2026, 8, 5)));
  });

  it("reads the Date ExcelJS already hands back for a date cell", () => {
    expect(parseSheetDate(new Date("2026-08-17T22:30:00Z"))).toEqual(
      new Date(Date.UTC(2026, 7, 18)),
    );
  });

  it("keeps an ISO timestamp's day", () => {
    expect(parseSheetDate("2026-08-30T14:00:00Z")).toEqual(
      new Date(Date.UTC(2026, 7, 30)),
    );
  });

  it("returns null for anything it does not understand", () => {
    expect(parseSheetDate(null)).toBeNull();
    expect(parseSheetDate("")).toBeNull();
    expect(parseSheetDate("manana")).toBeNull();
    expect(parseSheetDate("1,2")).toBeNull();
    // 31 de febrero: `Date.UTC` lo desplazaria a marzo en silencio.
    expect(parseSheetDate("31/02/2026")).toBeNull();
    expect(parseSheetDate(new Date("not a date"))).toBeNull();
  });
});
