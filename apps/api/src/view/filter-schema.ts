import * as v from "valibot";
import type { FilterNode } from "./filter-to-sql";

const OPERATORS = [
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

// El arbol es recursivo, asi que el esquema tambien: `v.lazy` es lo que
// permite referirse a si mismo sin que TypeScript entre en bucle. El limite de
// profundidad real lo pone el traductor; aqui solo se comprueba la forma.
export const filterNodeSchema: v.GenericSchema<FilterNode> = v.lazy(() =>
  v.union([
    v.object({
      type: v.literal("and"),
      children: v.array(filterNodeSchema),
    }),
    v.object({
      type: v.literal("or"),
      children: v.array(filterNodeSchema),
    }),
    v.object({
      type: v.literal("not"),
      child: filterNodeSchema,
    }),
    v.object({
      type: v.literal("condition"),
      field: v.pipe(v.string(), v.minLength(1), v.maxLength(120)),
      operator: v.picklist(OPERATORS),
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
