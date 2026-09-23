import { HTTPException } from "hono/http-exception";
import { describe, expect, it } from "vitest";
import {
  parseServerDay,
  serverDayKey,
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
