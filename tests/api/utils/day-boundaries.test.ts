import { HTTPException } from "hono/http-exception";
import { describe, expect, it } from "vitest";
import {
  addDays,
  dayKeysBetween,
  parseServerDay,
  serverDayKey,
  serverTimeZone,
  startOfServerDay,
} from "../../../apps/api/src/utils/day-boundaries";

describe("serverDayKey", () => {
  it("formats as yyyy-mm-dd from local date components", () => {
    expect(serverDayKey(new Date(2026, 0, 5, 23, 59, 59))).toBe("2026-01-05");
    expect(serverDayKey(new Date(2026, 8, 22, 0, 0, 0))).toBe("2026-09-22");
  });

  it("pads single-digit months and days", () => {
    expect(serverDayKey(new Date(2026, 2, 4))).toBe("2026-03-04");
  });

  it("agrees with startOfServerDay for the same instant", () => {
    const now = new Date(2026, 8, 22, 14, 0, 0);
    const key = serverDayKey(now);
    const start = startOfServerDay(now);
    expect(key).toBe(
      `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`,
    );
  });
});

describe("parseServerDay", () => {
  it("parses a yyyy-mm-dd string as local midnight, not UTC", () => {
    const result = parseServerDay("2026-09-16", "plannedDate");
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(8);
    expect(result.getDate()).toBe(16);
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
    expect(result.getSeconds()).toBe(0);
  });

  it("parses a full ISO instant and normalizes it to the server's start of day", () => {
    const result = parseServerDay("2026-09-16T10:30:00.000Z", "start");
    const expected = startOfServerDay(new Date("2026-09-16T10:30:00.000Z"));
    expect(result.getTime()).toBe(expected.getTime());
  });

  it("throws a 400 on an empty string", () => {
    expect(() => parseServerDay("", "plannedDate")).toThrowError(HTTPException);
    try {
      parseServerDay("   ", "plannedDate");
    } catch (error) {
      expect(error).toBeInstanceOf(HTTPException);
      expect((error as HTTPException).status).toBe(400);
    }
  });

  it("throws a 400 on an unparseable string", () => {
    expect(() => parseServerDay("not-a-date", "plannedDate")).toThrowError(
      HTTPException,
    );
    try {
      parseServerDay("not-a-date", "plannedDate");
    } catch (error) {
      expect(error).toBeInstanceOf(HTTPException);
      expect((error as HTTPException).status).toBe(400);
    }
  });
});

// ADR 049: la API vive en Europe/Madrid (fijado en `vitest.config.ts`, como en
// las imagenes). El 25 de octubre de 2026 los relojes vuelven de 03:00 a
// 02:00: ese dia dura 25 horas, y las fronteras tienen que seguir cayendo en
// medianoche local, no a 24 horas fijas de la anterior.
describe("day boundaries in Europe/Madrid across the end of summer time", () => {
  it("runs in the production time zone", () => {
    expect(serverTimeZone()).toBe("Europe/Madrid");
  });

  it("starts the day at local midnight on both sides of the change", () => {
    expect(
      startOfServerDay(new Date("2026-10-25T12:00:00Z")).toISOString(),
    ).toBe("2026-10-24T22:00:00.000Z");
    expect(
      startOfServerDay(new Date("2026-10-26T12:00:00Z")).toISOString(),
    ).toBe("2026-10-25T23:00:00.000Z");
  });

  it("adds a calendar day, not 24 hours, over the 25-hour day", () => {
    const start = parseServerDay("2026-10-25", "day");
    expect(addDays(start, 1).toISOString()).toBe(
      parseServerDay("2026-10-26", "day").toISOString(),
    );
    expect(dayKeysBetween(start, parseServerDay("2026-10-27", "day"))).toEqual([
      "2026-10-25",
      "2026-10-26",
      "2026-10-27",
    ]);
  });

  it("reads a day stored at Madrid midnight as that day, not the eve", () => {
    // Lo que manda el navegador como vencimiento del 1 de octubre.
    expect(serverDayKey(new Date("2026-09-30T22:00:00.000Z"))).toBe(
      "2026-10-01",
    );
  });
});
