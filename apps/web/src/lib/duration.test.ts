import { describe, expect, it } from "vitest";
import { parseDurationInput } from "./duration";

describe("parseDurationInput", () => {
  it("returns null for an empty string (sin estimar)", () => {
    expect(parseDurationInput("")).toBeNull();
    expect(parseDurationInput("   ")).toBeNull();
  });

  it("parses hours and minutes together", () => {
    expect(parseDurationInput("1h 30m")).toBe(90 * 60);
    expect(parseDurationInput("1h30")).toBe(90 * 60);
    expect(parseDurationInput("1h30m")).toBe(90 * 60);
  });

  it("parses hours only", () => {
    expect(parseDurationInput("2h")).toBe(2 * 3600);
  });

  it("parses minutes only, with or without 'in'", () => {
    expect(parseDurationInput("90m")).toBe(90 * 60);
    expect(parseDurationInput("45min")).toBe(45 * 60);
  });

  it("parses H:MM", () => {
    expect(parseDurationInput("1:30")).toBe(90 * 60);
    expect(parseDurationInput("0:45")).toBe(45 * 60);
  });

  it("parses bare decimal hours, with a dot or a comma", () => {
    expect(parseDurationInput("1.5")).toBe(90 * 60);
    expect(parseDurationInput("1,5")).toBe(90 * 60);
    expect(parseDurationInput("2")).toBe(2 * 3600);
  });

  it("rejects garbage instead of confusing it with 'sin estimar'", () => {
    expect(parseDurationInput("abc")).toBeUndefined();
    expect(parseDurationInput("1h abc")).toBeUndefined();
    expect(parseDurationInput("25:99")).toBeUndefined();
  });

  it("rejects a negative bare number", () => {
    expect(parseDurationInput("-1")).toBeUndefined();
  });
});
