import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  assertFormulaCompiles,
  compileFormula,
  parseStoredFormula,
} from "../../../apps/api/src/field/formula/compile";
import {
  FormulaError,
  type FormulaNode,
  formatFormula,
  parseFormula,
  referencedKeys,
  resolveFormulaNames,
  usesBranchValues,
} from "../../../apps/api/src/field/formula/parse";

const fields = [
  { key: "presupuesto", name: "Presupuesto", type: "currency" },
  { key: "horas_previstas", name: "Horas previstas", type: "number" },
  { key: "coste", name: "Coste estimado", type: "formula" },
  { key: "partida", name: "Partida", type: "text" },
];

function canonical(source: string) {
  return formatFormula(resolveFormulaNames(parseFormula(source), fields));
}

function toSql(key: string, formulas: Map<string, FormulaNode>) {
  return new PgDialect().sqlToQuery(
    compileFormula(key, {
      customFields: sql`t."custom_fields"`,
      branch: { estimate: sql`b."estimate"`, logged: sql`b."logged"` },
      formulas,
    }),
  );
}

describe("parseFormula", () => {
  it("reads names between braces and single words without them", () => {
    expect(canonical("{Presupuesto} / {Horas previstas}")).toBe(
      "{presupuesto} / {horas_previstas}",
    );
    expect(canonical("presupuesto * 2")).toBe("{presupuesto} * 2");
  });

  it("ignores case and accents in names, functions and keywords", () => {
    expect(canonical("SI({PRESUPUESTO} > 0; 1; VACÍO)")).toBe(
      "si({presupuesto} > 0; 1; vacío)",
    );
    expect(canonical("máximo({presupuesto}; 0)")).toBe("max({presupuesto}; 0)");
  });

  it("takes a decimal comma between digits and a comma as a separator elsewhere", () => {
    expect(canonical("{presupuesto} * 1,5")).toBe("{presupuesto} * 1.5");
    expect(canonical("min({presupuesto}, 10)")).toBe("min({presupuesto}; 10)");
    expect(canonical("min(1,5)")).toBe("min(1.5)");
  });

  it("accepts the typographic operators the interface shows", () => {
    expect(canonical("{presupuesto} ÷ {horas previstas} × 2 − 1")).toBe(
      "{presupuesto} / {horas_previstas} * 2 - 1",
    );
    expect(canonical("si({presupuesto} ≥ 1; 1; 0)")).toBe(
      "si({presupuesto} >= 1; 1; 0)",
    );
  });

  it("resolves the branch estimate and logged time in both languages", () => {
    expect(canonical("{Estimado} - {Registrado}")).toBe(
      "{:estimate} - {:logged}",
    );
    expect(canonical("{estimate} + {logged}")).toBe("{:estimate} + {:logged}");
  });

  it("keeps precedence and only the parentheses it needs", () => {
    expect(canonical("({presupuesto} - 1) * 2")).toBe(
      "({presupuesto} - 1) * 2",
    );
    expect(canonical("{presupuesto} - (1 - 2)")).toBe(
      "{presupuesto} - (1 - 2)",
    );
    expect(canonical("{presupuesto} - 1 - 2")).toBe("{presupuesto} - 1 - 2");
    expect(canonical("-({presupuesto} + 1)")).toBe("-({presupuesto} + 1)");
  });

  it("gives si() an empty else when it is left out", () => {
    expect(canonical("si({presupuesto} > 0; 1)")).toBe(
      "si({presupuesto} > 0; 1; vacío)",
    );
  });

  it("round-trips the stored form", () => {
    for (const source of [
      "si({presupuesto} > 0; ({presupuesto} - {coste}) / {presupuesto}; vacío)",
      "max({:estimate} - {:logged}; 0) * 1.5",
      "-{presupuesto} / -2",
    ]) {
      const stored = canonical(source);
      expect(formatFormula(parseStoredFormula(stored))).toBe(stored);
    }
  });

  it.each([
    ["", "empty"],
    ["{presupuesto} +", "ends too early"],
    ["{presupuesto", "closing }"],
    ["Horas previstas", 'Unexpected "previstas"'],
    ["{presupuesto} > 0", "condition of si()"],
    ["si({presupuesto}; 1; 2)", "must be a comparison"],
    ["si({presupuesto} > 0)", "takes a condition"],
    ["redondear({presupuesto})", 'Unknown function "redondear"'],
    ["min()", "at least one value"],
    ["{presupuesto} # 2", 'Unexpected character "#"'],
    ["(1 + 2", ") to close"],
  ])("rejects %j", (source, message) => {
    expect(() => canonical(source)).toThrow(FormulaError);
    expect(() => canonical(source)).toThrow(message);
  });

  it("rejects unknown fields and fields that are not numbers", () => {
    expect(() => canonical("{Margen}")).toThrow('Unknown field "Margen"');
    expect(() => canonical("{Partida} * 2")).toThrow(
      '"Partida" is not a number',
    );
  });

  it("asks for the key when two fields share a name", () => {
    const twins = [
      { key: "a", name: "Horas", type: "number" },
      { key: "b", name: "horas", type: "number" },
    ];
    expect(() => resolveFormulaNames(parseFormula("{Horas}"), twins)).toThrow(
      "More than one field",
    );
    expect(formatFormula(resolveFormulaNames(parseFormula("{b}"), twins))).toBe(
      "{b}",
    );
  });

  it("caps the length", () => {
    expect(() => parseFormula("1+".repeat(300))).toThrow("at most 500");
  });

  it("says which fields it reads and whether it needs the branch", () => {
    const formula = resolveFormulaNames(
      parseFormula("si({presupuesto} > 0; {coste} / {Registrado}; 0)"),
      fields,
    );
    expect([...referencedKeys(formula)].sort()).toEqual([
      "coste",
      "presupuesto",
    ]);
    expect(usesBranchValues(formula)).toBe(true);
    expect(usesBranchValues(parseStoredFormula("{presupuesto} * 2"))).toBe(
      false,
    );
  });
});

describe("compileFormula", () => {
  it("guards casts, division by zero and an unknown condition", () => {
    const formulas = new Map([
      [
        "margen",
        parseStoredFormula(
          "si({presupuesto} > 0; {presupuesto} / {horas_previstas}; vacío)",
        ),
      ],
    ]);
    const { sql: text } = toSql("margen", formulas);
    expect(text).toContain("jsonb_typeof");
    expect(text).toContain("NULLIF(");
    expect(text).toContain("IS NULL THEN NULL::numeric");
    expect(text).toMatch(/^trim_scale\(round\(/);
  });

  it("expands a calculated field it reads instead of its stored value", () => {
    const formulas = new Map([
      ["coste", parseStoredFormula("{:logged} * 30")],
      ["margen", parseStoredFormula("{presupuesto} - {coste}")],
    ]);
    const { sql: text } = toSql("margen", formulas);
    expect(text).toContain('b."logged"');
    expect(text).not.toContain("'coste'");
  });

  it("uses LEAST and GREATEST, which skip empty values", () => {
    const formulas = new Map([
      ["x", parseStoredFormula("min({a}; max({b}; 0))")],
    ]);
    const { sql: text } = toSql("x", formulas);
    expect(text).toContain("LEAST(");
    expect(text).toContain("GREATEST(");
  });

  it("refuses a cycle and a formula that grows too large", () => {
    const cycle = new Map([
      ["a", parseStoredFormula("{b} + 1")],
      ["b", parseStoredFormula("{a} + 1")],
    ]);
    expect(() => assertFormulaCompiles("a", cycle)).toThrow("reading itself");

    // Cada nivel lee dos veces al anterior: 2^12 nodos desplegados.
    const big = new Map<string, FormulaNode>([
      ["f0", parseStoredFormula("{n}")],
    ]);
    for (let level = 1; level <= 12; level += 1) {
      big.set(
        `f${level}`,
        parseStoredFormula(`{f${level - 1}} + {f${level - 1}}`),
      );
    }
    expect(() => assertFormulaCompiles("f12", big)).toThrow("too complex");
  });
});
