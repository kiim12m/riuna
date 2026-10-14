import { describe, expect, it } from "vitest";
import { formulaToDisplay, formulaToEditable } from "./formula-text";

const fields = [
  { key: "presupuesto", name: "Presupuesto" },
  { key: "horas_previstas", name: "Horas previstas" },
];
const builtins = { estimate: "Estimado", logged: "Registrado" };

describe("formula text", () => {
  it("writes the stored keys back as names to edit", () => {
    expect(
      formulaToEditable(
        "si({presupuesto} > 0; {presupuesto} / {:estimate}; vacío)",
        fields,
        builtins,
      ),
    ).toBe("si({Presupuesto} > 0; {Presupuesto} / {Estimado}; vacío)");
  });

  it("shows names without braces and the usual signs", () => {
    expect(
      formulaToDisplay(
        "({presupuesto} - {:logged}) / {horas_previstas} * 2",
        fields,
        builtins,
      ),
    ).toBe("(Presupuesto − Registrado) ÷ Horas previstas × 2");
  });

  it("leaves an unknown key as it is", () => {
    expect(formulaToDisplay("{borrado} * 2", fields, builtins)).toBe(
      "borrado × 2",
    );
  });
});
