import { describe, expect, it } from "vitest";
import { diffLines, readableMarkdown } from "./line-diff";

describe("diffLines", () => {
  it("keeps common lines and marks what changed", () => {
    expect(
      diffLines(
        "Antes\n3. Cerrar todos los circuitos.\nFin",
        "Antes\n3. Cerrar los circuitos de uno en uno.\nFin\nTabla nueva",
      ),
    ).toEqual([
      { kind: "same", text: "Antes" },
      { kind: "removed", text: "3. Cerrar todos los circuitos." },
      { kind: "added", text: "3. Cerrar los circuitos de uno en uno." },
      { kind: "same", text: "Fin" },
      { kind: "added", text: "Tabla nueva" },
    ]);
  });

  it("handles an empty side", () => {
    expect(diffLines("", "Una")).toEqual([
      { kind: "removed", text: "" },
      { kind: "added", text: "Una" },
    ]);
  });
});

describe("readableMarkdown", () => {
  it("shows chips as text", () => {
    expect(
      readableMarkdown(
        'Ver <riuna-issue-link url="x" issue-key="ALC-6" task-id="t" /> con <riuna-mention id="u" label="Marc"></riuna-mention> en <riuna-page-link page-id="p" title="Actas" />',
      ),
    ).toBe("Ver ALC-6 con @Marc en [[Actas]]");
  });
});
