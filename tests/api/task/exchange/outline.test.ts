import { describe, expect, it } from "vitest";
import {
  type OutlineRow,
  parseOutline,
  resolveOutline,
} from "../../../../apps/api/src/task/exchange/outline";

function rows(...outlines: string[]): OutlineRow[] {
  return outlines.map((outline, index) => ({ index, outline }));
}

describe("parseOutline", () => {
  it("accepts a plain numbering", () => {
    expect(parseOutline("1")).toEqual(["1"]);
    expect(parseOutline("1.2.3")).toEqual(["1", "2", "3"]);
  });

  it("forgives what a spreadsheet produces on its own", () => {
    expect(parseOutline("  1.2  ")).toEqual(["1", "2"]);
    expect(parseOutline("1.2.")).toEqual(["1", "2"]);
  });

  it("refuses to guess a decimal comma", () => {
    // En una hoja espanola `1,2` es el numero uno coma dos. Leerlo como
    // jerarquia convertiria una celda mal tecleada en un arbol inventado.
    expect(parseOutline("1,2")).toBeNull();
  });

  it("rejects anything that is not a numbering", () => {
    expect(parseOutline("")).toBeNull();
    expect(parseOutline("   ")).toBeNull();
    expect(parseOutline("primero")).toBeNull();
    expect(parseOutline("1.a")).toBeNull();
    expect(parseOutline("1..2")).toBeNull();
  });
});

describe("resolveOutline", () => {
  it("hangs each row from the row one level above it", () => {
    const { resolutions, issues } = resolveOutline(
      rows("1", "1.1", "1.1.1", "1.2", "2"),
    );

    expect(issues).toEqual([]);
    expect(resolutions.map((entry) => entry.parentIndex)).toEqual([
      null,
      0,
      1,
      0,
      null,
    ]);
    expect(resolutions.map((entry) => entry.depthInFile)).toEqual([
      0, 1, 2, 1, 0,
    ]);
  });

  it("treats a blank outline as a root", () => {
    const { resolutions, issues } = resolveOutline(rows("", "  "));

    expect(issues).toEqual([]);
    expect(resolutions.every((entry) => entry.parentIndex === null)).toBe(true);
  });

  it("never promotes a row across a skipped level", () => {
    // `1.1.1.1` sin `1.1.1` delante NO se cuelga de `1.1`: se declara huerfana.
    // Colgarla seria subirla dos niveles sin que nadie lo pidiera.
    const { resolutions, issues } = resolveOutline(rows("1", "1.1", "1.1.1.1"));

    expect(resolutions[2]?.parentIndex).toBeNull();
    expect(resolutions[2]?.parentMissing).toBe(true);
    expect(issues).toEqual([
      { kind: "orphan", index: 2, outline: "1.1.1.1", parentOutline: "1.1.1" },
    ]);
  });

  it("declares an orphan when the file is a filtered slice of a tree", () => {
    // Es el caso de exportar una vista filtrada: llega `1.1.1` sin sus
    // ancestros. La fila no se toca, y quien llama decide con su `ID` delante.
    const { resolutions, issues } = resolveOutline(rows("1.1.1"));

    expect(resolutions[0]).toEqual({
      index: 0,
      parentIndex: null,
      parentMissing: true,
      depthInFile: 0,
    });
    expect(issues).toEqual([
      { kind: "orphan", index: 0, outline: "1.1.1", parentOutline: "1.1" },
    ]);
  });

  it("refuses to pick a winner between two rows with the same outline", () => {
    const { resolutions, issues } = resolveOutline(
      rows("1", "1.1", "1.1", "1.1.1"),
    );

    expect(issues).toContainEqual({
      kind: "duplicate",
      outline: "1.1",
      indexes: [1, 2],
    });
    // Ninguna de las dos hace de madre, asi que su hija queda huerfana en vez
    // de colgar de una de las dos al azar.
    expect(resolutions[3]?.parentMissing).toBe(true);
    expect(resolutions[1]?.parentIndex).toBeNull();
    expect(resolutions[2]?.parentIndex).toBeNull();
  });

  it("reports an unusable outline without dropping the row", () => {
    const { resolutions, issues } = resolveOutline(rows("1", "primero", "1.1"));

    expect(issues).toContainEqual({
      kind: "invalid",
      index: 1,
      outline: "primero",
    });
    expect(resolutions).toHaveLength(3);
    expect(resolutions[1]?.parentIndex).toBeNull();
    // La fila rota no rompe la de al lado: `1.1` sigue colgando de `1`.
    expect(resolutions[2]?.parentIndex).toBe(0);
  });

  it("only looks backwards, so a parent listed after its child is missing", () => {
    const { resolutions } = resolveOutline(rows("1.1", "1"));

    expect(resolutions[0]?.parentMissing).toBe(true);
    expect(resolutions[1]?.parentIndex).toBeNull();
  });

  it("keeps sibling branches apart", () => {
    const { resolutions, issues } = resolveOutline(
      rows("1", "1.1", "2", "2.1", "2.1.1"),
    );

    expect(issues).toEqual([]);
    expect(resolutions.map((entry) => entry.parentIndex)).toEqual([
      null,
      0,
      null,
      2,
      3,
    ]);
  });
});
