import { type SQL, sql } from "drizzle-orm";
import {
  FormulaError,
  type FormulaNode,
  normalizeWord,
  parseFormula,
} from "./parse";

// Una formula se evalua en la base, no en JavaScript (ADR 090): la misma
// sentencia `UPDATE` que la guarda la calcula sobre la version de la fila que
// esta escribiendo, asi que dos ediciones casi simultaneas no se pisan, y
// recalcular un proyecto entero es una sola sentencia y no un ida y vuelta por
// tarea.

/**
 * Mas alla de esto una formula —con las que lee, desplegadas— deja de ser algo
 * que una persona pueda seguir, y la SQL crece sin control: cada formula que
 * lee a otra la copia entera.
 */
export const MAX_EXPANDED_NODES = 2_000;

export type FormulaScope = {
  /** El `custom_fields` de la fila que se calcula. */
  customFields: SQL;
  /** Estimacion y registrado de la rama, en segundos; sin ellos, vacios. */
  branch: { estimate: SQL; logged: SQL } | null;
  /** Las formulas vigentes en el proyecto, por clave. */
  formulas: Map<string, FormulaNode>;
};

/**
 * La forma guardada ya viene resuelta (`{clave}`, `{:estimate}`), asi que al
 * leerla no se vuelve a buscar por nombre: una clave que ya no sea numerica en
 * un proyecto concreto sale vacia en la propia SQL, no como un error que
 * impediria recalcular el resto.
 */
export function parseStoredFormula(expression: string): FormulaNode {
  const resolve = (node: FormulaNode): FormulaNode => {
    switch (node.kind) {
      case "name": {
        const word = normalizeWord(node.name);
        if (word === ":estimate") return { kind: "builtin", name: "estimate" };
        if (word === ":logged") return { kind: "builtin", name: "logged" };
        return { kind: "field", key: node.name };
      }
      case "negate":
        return { kind: "negate", operand: resolve(node.operand) };
      case "binary":
      case "compare":
        return {
          ...node,
          left: resolve(node.left),
          right: resolve(node.right),
        } as FormulaNode;
      case "if":
        return {
          kind: "if",
          condition: resolve(node.condition),
          whenTrue: resolve(node.whenTrue),
          whenFalse: resolve(node.whenFalse),
        };
      case "min":
      case "max":
        return { kind: node.kind, args: node.args.map(resolve) };
      default:
        return node;
    }
  };
  return resolve(parseFormula(expression));
}

function compileNode(
  node: FormulaNode,
  scope: FormulaScope,
  stack: Set<string>,
  budget: { nodes: number },
): SQL {
  budget.nodes += 1;
  if (budget.nodes > MAX_EXPANDED_NODES) {
    throw new FormulaError(
      "The formula is too complex once the calculated fields it reads are expanded",
    );
  }

  switch (node.kind) {
    case "number":
      return sql`${node.value}::numeric`;
    case "empty":
      return sql`NULL::numeric`;
    case "name":
      throw new FormulaError(`Unresolved name "${node.name}"`);
    case "field": {
      const formula = scope.formulas.get(node.key);
      if (formula) {
        // Una formula que lee a otra la despliega en vez de leer el valor
        // guardado: dentro de una misma sentencia ese valor aun seria el viejo.
        if (stack.has(node.key)) {
          throw new FormulaError(
            `The calculated field "${node.key}" ends up reading itself`,
          );
        }
        stack.add(node.key);
        const inner = compileNode(formula, scope, stack, budget);
        stack.delete(node.key);
        return sql`(${inner})`;
      }
      // `jsonb_typeof` antes de convertir, como el motor de filtros: un texto
      // guardado bajo una clave numerica reventaria el `::numeric`.
      const value = sql`${scope.customFields} -> ${node.key}::text`;
      return sql`(CASE WHEN jsonb_typeof(${value}) = 'number' THEN (${scope.customFields} ->> ${node.key}::text)::numeric END)`;
    }
    case "builtin": {
      if (!scope.branch) return sql`NULL::numeric`;
      const seconds =
        node.name === "estimate" ? scope.branch.estimate : scope.branch.logged;
      return sql`(${seconds} / 3600.0)`;
    }
    case "negate":
      return sql`(- ${compileNode(node.operand, scope, stack, budget)})`;
    case "binary": {
      const left = compileNode(node.left, scope, stack, budget);
      const right = compileNode(node.right, scope, stack, budget);
      // Dividir por cero deja el resultado vacio, igual que dividir por un
      // dato que falta.
      if (node.op === "/") return sql`(${left} / NULLIF(${right}, 0))`;
      return sql`(${left} ${sql.raw(node.op)} ${right})`;
    }
    case "compare": {
      const left = compileNode(node.left, scope, stack, budget);
      const right = compileNode(node.right, scope, stack, budget);
      return sql`(${left} ${sql.raw(node.op)} ${right})`;
    }
    case "if": {
      // Si la condicion no se puede saber porque falta un dato, el resultado
      // queda vacio: es la misma regla que en el resto de la formula.
      const condition = compileNode(node.condition, scope, stack, budget);
      const whenTrue = compileNode(node.whenTrue, scope, stack, budget);
      const whenFalse = compileNode(node.whenFalse, scope, stack, budget);
      return sql`(CASE WHEN ${condition} IS NULL THEN NULL::numeric WHEN ${condition} THEN ${whenTrue} ELSE ${whenFalse} END)`;
    }
    case "min":
    case "max": {
      // `LEAST` y `GREATEST` ignoran los nulos: solo dan vacio si lo estan
      // todos. Es lo que se decidio para minimo y maximo (ADR 090).
      const args = node.args.map((arg) =>
        compileNode(arg, scope, stack, budget),
      );
      const fn = node.kind === "min" ? sql`LEAST` : sql`GREATEST`;
      return sql`${fn}(${sql.join(args, sql`, `)})`;
    }
  }
}

/** La expresion SQL de la formula guardada bajo `key`, ya redondeada. */
export function compileFormula(key: string, scope: FormulaScope): SQL {
  const formula = scope.formulas.get(key);
  if (!formula) return sql`NULL::numeric`;
  const expression = compileNode(formula, scope, new Set([key]), {
    nodes: 0,
  });
  return sql`trim_scale(round((${expression})::numeric, 6))`;
}

/**
 * Comprueba, sin tocar la base, que una formula se puede desplegar: que no se
 * lee a si misma a traves de otras y que no pasa del tamano maximo.
 */
export function assertFormulaCompiles(
  key: string,
  formulas: Map<string, FormulaNode>,
) {
  compileFormula(key, {
    customFields: sql`'{}'::jsonb`,
    branch: { estimate: sql`0`, logged: sql`0` },
    formulas,
  });
}
