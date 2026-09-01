import { describe, expect, it } from "vitest";
import { slugifyFieldKey } from "../../../../apps/api/src/field/field-types";
import {
  columnFor,
  EXCHANGE_COLUMNS,
  formatList,
  matchHeader,
  normalizeHeader,
  splitList,
} from "../../../../apps/api/src/task/exchange/format";

describe("matchHeader", () => {
  it("matches the canonical header the export writes", () => {
    const match = matchHeader("Título");
    expect(match).toEqual({ kind: "reserved", column: columnFor("title") });
  });

  it("ignores case, accents, spacing and punctuation", () => {
    for (const header of ["titulo", "TÍTULO", "  Titulo  ", "Título:"]) {
      expect(matchHeader(header)).toEqual({
        kind: "reserved",
        column: columnFor("title"),
      });
    }
  });

  it("accepts the English aliases", () => {
    expect(matchHeader("Due date")).toEqual({
      kind: "reserved",
      column: columnFor("dueDate"),
    });
    expect(matchHeader("assignees")).toEqual({
      kind: "reserved",
      column: columnFor("assignees"),
    });
  });

  it("keeps the two description columns apart", () => {
    expect(matchHeader("Descripción")).toEqual({
      kind: "reserved",
      column: columnFor("description"),
    });
    expect(matchHeader("Descripción (HTML)")).toEqual({
      kind: "reserved",
      column: columnFor("descriptionHtml"),
    });
  });

  it("turns an unknown header into a custom field key", () => {
    expect(matchHeader("Nº de expediente")).toEqual({
      kind: "custom",
      key: "n_de_expediente",
    });
  });

  it("derives that key with the same function the field module uses", () => {
    // Que las dos normalizaciones sean la misma es lo que impide que
    // "Presupuesto " case como reservada y "Presupuesto" no, o al reves.
    const header = "Presupuesto anual (€)";
    const match = matchHeader(header);

    expect(match).toEqual({ kind: "custom", key: slugifyFieldKey(header) });
    expect(normalizeHeader(header)).toBe(slugifyFieldKey(header));
  });

  it("ignores a header that leaves no usable key", () => {
    expect(matchHeader("")).toEqual({ kind: "ignored" });
    expect(matchHeader("   ")).toEqual({ kind: "ignored" });
    expect(matchHeader("###")).toEqual({ kind: "ignored" });
  });
});

describe("the column vocabulary", () => {
  it("has no two columns claiming the same normalized header", () => {
    const claimed = new Map<string, string>();

    for (const column of EXCHANGE_COLUMNS) {
      for (const name of [column.header, ...column.aliases]) {
        const normalized = normalizeHeader(name);
        const owner = claimed.get(normalized);
        expect(
          owner === undefined || owner === column.field,
          `"${name}" is claimed by both "${owner}" and "${column.field}"`,
        ).toBe(true);
        claimed.set(normalized, column.field);
      }
    }
  });

  it("gives every column a header that survives normalization", () => {
    for (const column of EXCHANGE_COLUMNS) {
      expect(normalizeHeader(column.header)).not.toBe("");
    }
  });
});

describe("multi-value cells", () => {
  it("splits, trims and drops the empties", () => {
    expect(splitList("obra; urgente ;;cliente")).toEqual([
      "obra",
      "urgente",
      "cliente",
    ]);
  });

  it("returns nothing for an empty cell", () => {
    expect(splitList("")).toEqual([]);
    expect(splitList(null)).toEqual([]);
    expect(splitList(undefined)).toEqual([]);
  });

  it("does not repeat a value listed twice", () => {
    expect(splitList("obra;obra")).toEqual(["obra"]);
  });

  it("round-trips a list", () => {
    const values = ["obra", "urgente", "cliente"];
    expect(splitList(formatList(values))).toEqual(values);
  });

  it("sacrifices a separator inside a value rather than the value", () => {
    // "urgente; hoy" partiria la celda en dos al releerla. Perder el punto y
    // coma se nota; perder media etiqueta, no.
    expect(splitList(formatList(["urgente; hoy", "obra"]))).toEqual([
      "urgente, hoy",
      "obra",
    ]);
  });
});
