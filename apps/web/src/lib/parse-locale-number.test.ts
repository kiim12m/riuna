import { describe, expect, it } from "vitest";
import { parseLocaleNumber } from "./parse-locale-number";

describe("parseLocaleNumber", () => {
  it("reads Spanish numbers the way they are written", () => {
    expect(parseLocaleNumber("1,5", "es-ES")).toBe(1.5);
    expect(parseLocaleNumber("1.500", "es-ES")).toBe(1500);
    expect(parseLocaleNumber("1.500,50", "es-ES")).toBe(1500.5);
    expect(parseLocaleNumber("12.000.000", "es-ES")).toBe(12_000_000);
    expect(parseLocaleNumber("-3", "es-ES")).toBe(-3);
    expect(parseLocaleNumber(" 42 ", "es-ES")).toBe(42);
  });

  // Un punto que no forma miles es un decimal: "1.5" no puede valer 15.
  it("takes a lone separator that is not a thousands group as the decimal", () => {
    expect(parseLocaleNumber("1.5", "es-ES")).toBe(1.5);
    expect(parseLocaleNumber("0,25", "es-ES")).toBe(0.25);
  });

  it("follows the locale, not a fixed convention", () => {
    expect(parseLocaleNumber("1,500", "en-US")).toBe(1500);
    expect(parseLocaleNumber("1,500.50", "en-US")).toBe(1500.5);
    expect(parseLocaleNumber("1.5", "en-US")).toBe(1.5);
  });

  it("tolerates what someone is still typing", () => {
    expect(parseLocaleNumber("1,", "es-ES")).toBe(1);
  });

  it("answers null, never NaN, for what is not a number", () => {
    for (const text of ["", "-", "€", "abc", "1.500,50,3", "1..5"]) {
      expect(parseLocaleNumber(text, "es-ES")).toBeNull();
    }
  });
});
