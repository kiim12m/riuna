import * as v from "valibot";
import type { FilterNode } from "./filter-to-sql";

export const FILTER_OPERATORS = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "contains",
  "startsWith",
  "in",
  "notIn",
  "isEmpty",
  "isNotEmpty",
] as const;

// Cuantas condiciones caben en un solo grupo. El traductor acota la
// profundidad (`MAX_DEPTH`), que es el anidamiento; esto acota la anchura, que
// no vigilaba nadie: un `and` plano con cientos de `contains` pasa la
// validacion de profundidad y se evalua por fila sobre un barrido. Hoy el
// techo efectivo lo pone por accidente el tamano maximo de cabecera de
// node:http, y un accidente no es una defensa.
const MAX_CHILDREN_PER_GROUP = 50;

// El arbol es recursivo, asi que el esquema tambien: `v.lazy` es lo que
// permite referirse a si mismo sin que TypeScript entre en bucle. El limite de
// profundidad real lo pone el traductor; aqui solo se comprueba la forma.
export const filterNodeSchema: v.GenericSchema<FilterNode> = v.lazy(() =>
  v.union([
    v.object({
      type: v.literal("and"),
      children: v.pipe(
        v.array(filterNodeSchema),
        v.maxLength(MAX_CHILDREN_PER_GROUP),
      ),
    }),
    v.object({
      type: v.literal("or"),
      children: v.pipe(
        v.array(filterNodeSchema),
        v.maxLength(MAX_CHILDREN_PER_GROUP),
      ),
    }),
    v.object({
      type: v.literal("not"),
      child: filterNodeSchema,
    }),
    v.object({
      type: v.literal("condition"),
      field: v.pipe(v.string(), v.minLength(1), v.maxLength(120)),
      operator: v.picklist(FILTER_OPERATORS),
      value: v.optional(v.unknown()),
    }),
  ]),
);

/**
 * Lee un filtro que viaja como JSON en la cadena de consulta.
 *
 * Va en la URL y no en el cuerpo porque listar tareas es un `GET` y tiene que
 * seguir siendo cacheable y enlazable: una vista guardada es, al final, una
 * URL. Un filtro que no sea JSON valido o que no encaje con la forma es un
 * 400, no un filtro ignorado en silencio.
 */
export function parseFilterParam(raw: string | undefined): FilterNode | null {
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("The filter is not valid JSON");
  }

  const result = v.safeParse(filterNodeSchema, parsed);

  if (!result.success) {
    const [issue] = result.issues;
    throw new Error(issue?.message ?? "The filter has an unexpected shape");
  }

  return result.output;
}
