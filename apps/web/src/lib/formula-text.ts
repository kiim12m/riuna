// La API guarda una formula con claves —`{presupuesto} / {:estimate}`— para
// que renombrar un campo no la rompa (ADR 090). Aqui se vuelve a escribir con
// nombres: entre llaves para editarla, que es lo que la API vuelve a leer, y
// sin ellas y con los signos de siempre para ensenarla.

export type FormulaField = { key: string; name: string };

export type FormulaBuiltinNames = { estimate: string; logged: string };

const REFERENCE = /\{([^}]*)\}/g;

function nameOf(
  reference: string,
  fields: FormulaField[],
  builtins: FormulaBuiltinNames,
) {
  if (reference === ":estimate") return builtins.estimate;
  if (reference === ":logged") return builtins.logged;
  return fields.find((field) => field.key === reference)?.name ?? reference;
}

/** Para el editor: `{Presupuesto} / {Estimado}`. */
export function formulaToEditable(
  expression: string,
  fields: FormulaField[],
  builtins: FormulaBuiltinNames,
) {
  return expression.replace(
    REFERENCE,
    (_, reference: string) => `{${nameOf(reference, fields, builtins)}}`,
  );
}

/** Para leerla: `Presupuesto ÷ Estimado`. */
export function formulaToDisplay(
  expression: string,
  fields: FormulaField[],
  builtins: FormulaBuiltinNames,
) {
  // Primero los signos, que no pueden tocar lo que hay dentro de un nombre.
  return expression
    .split(REFERENCE)
    .map((part, index) =>
      index % 2 === 1
        ? nameOf(part, fields, builtins)
        : part
            .replace(/ \/ /g, " ÷ ")
            .replace(/ \* /g, " × ")
            .replace(/ - /g, " − "),
    )
    .join("");
}
