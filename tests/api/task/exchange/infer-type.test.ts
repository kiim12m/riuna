import { describe, expect, it } from "vitest";
import { inferColumnType } from "../../../../apps/api/src/task/exchange/infer-type";

describe("inferColumnType", () => {
  it("falls back to text for an empty column", () => {
    expect(inferColumnType([])).toEqual({ type: "text" });
    expect(inferColumnType(["", "  "])).toEqual({ type: "text" });
  });

  it("reads numbers", () => {
    expect(inferColumnType(["1200", "-3", "45,5", "0"])).toEqual({
      type: "number",
    });
  });

  it("leaves a code with leading zeros as text", () => {
    // "00123" convertido en numero ha perdido los ceros para siempre, y `type`
    // es inmutable (ADR 013), asi que el error no se corrige despues.
    expect(inferColumnType(["00123", "00456"])).toEqual({ type: "text" });
  });

  it("reads dates in both notations", () => {
    expect(inferColumnType(["2026-08-30", "2026-01-02"])).toEqual({
      type: "date",
    });
    expect(inferColumnType(["30/08/2026", "2-1-2026"])).toEqual({
      type: "date",
    });
  });

  it("reads a checkbox column", () => {
    expect(inferColumnType(["Sí", "no", "SI", "No"])).toEqual({
      type: "checkbox",
    });
    expect(inferColumnType(["true", "false"])).toEqual({ type: "checkbox" });
  });

  it("proposes a select when few values repeat a lot", () => {
    const values = Array.from({ length: 30 }, (_, index) =>
      index % 3 === 0 ? "Obra" : index % 3 === 1 ? "Taller" : "Oficina",
    );

    expect(inferColumnType(values)).toEqual({
      type: "select",
      options: ["Obra", "Taller", "Oficina"],
    });
  });

  it("does not propose a select when the values barely repeat", () => {
    // Veinte valores distintos en veinte filas no son un desplegable, son
    // texto libre que da la casualidad de ser corto.
    const values = Array.from({ length: 20 }, (_, index) => `Cliente ${index}`);

    expect(inferColumnType(values)).toEqual({ type: "text" });
  });

  it("proposes a multi-select when the cells carry lists", () => {
    expect(
      inferColumnType(["obra; urgente", "urgente", "obra", "obra; taller"]),
    ).toEqual({
      type: "multi_select",
      options: ["obra", "urgente", "taller"],
    });
  });

  it("keeps free text with a stray separator as text", () => {
    const values = Array.from(
      { length: 40 },
      (_, index) => `nota ${index}; ampliada ${index}`,
    );

    expect(inferColumnType(values)).toEqual({ type: "text" });
  });

  it("ignores blank cells when deciding", () => {
    expect(inferColumnType(["1200", "", "  ", "300"])).toEqual({
      type: "number",
    });
  });

  it("does not call a mixed column anything but text", () => {
    expect(inferColumnType(["1200", "pendiente"])).toEqual({ type: "text" });
  });
});
