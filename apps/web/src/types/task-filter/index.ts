// El mismo vocabulario que el traductor de la API. Se repite aqui en vez de
// importarse porque `apps/web` no depende de `apps/api`; el contrato lo
// sostienen las pruebas del traductor y el 400 que devuelve el servidor ante
// cualquier forma que no reconozca.

export type FilterOperator =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "contains"
  | "startsWith"
  | "in"
  | "notIn"
  | "isEmpty"
  | "isNotEmpty";

export type FilterCondition = {
  type: "condition";
  field: string;
  operator: FilterOperator;
  value?: unknown;
};

export type TaskFilter =
  | { type: "and"; children: TaskFilter[] }
  | { type: "or"; children: TaskFilter[] }
  | { type: "not"; child: TaskFilter }
  | FilterCondition;

/**
 * Una condicion mientras se edita. El `id` es solo de la interfaz —React lo
 * necesita como clave estable— y no viaja a la API: con el indice como clave,
 * borrar una condicion arrastra el estado del input a la siguiente.
 */
export type EditableCondition = FilterCondition & { id: string };

/** Como se compara un campo, que decide que operadores se le ofrecen. */
export type FilterValueType =
  | "text"
  | "number"
  | "date"
  | "boolean"
  | "id"
  // Una lista guardada como array: se pregunta que contiene, no se compara.
  | "idList";

export type FilterableField = {
  /** El nombre que entiende el motor: `status`, `custom.presupuesto`… */
  key: string;
  label: string;
  valueType: FilterValueType;
  /** Opciones cerradas, cuando el campo las tiene. */
  options?: Array<{ value: string; label: string }>;
};

// El mismo reparto que `OPERATORS_BY_VALUE_TYPE` en la API. Si divergen, el
// servidor rechaza la combinacion con un 400 en vez de producir SQL rara.
export const OPERATORS_BY_TYPE: Record<FilterValueType, FilterOperator[]> = {
  text: ["eq", "neq", "contains", "startsWith", "isEmpty", "isNotEmpty"],
  id: ["eq", "neq", "in", "notIn", "isEmpty", "isNotEmpty"],
  number: ["eq", "neq", "gt", "gte", "lt", "lte", "isEmpty", "isNotEmpty"],
  date: ["eq", "neq", "gt", "gte", "lt", "lte", "isEmpty", "isNotEmpty"],
  boolean: ["eq", "neq", "isEmpty", "isNotEmpty"],
  // Sobre una lista, `eq` es "la contiene" e `in` "contiene alguna de".
  idList: ["eq", "neq", "in", "notIn", "isEmpty", "isNotEmpty"],
};

/** Los operadores que no llevan valor. */
export function operatorTakesValue(operator: FilterOperator) {
  return operator !== "isEmpty" && operator !== "isNotEmpty";
}

/**
 * Envuelve las condiciones en el arbol que espera la API.
 *
 * De momento solo se construyen conjunciones: es lo que la gente escribe el
 * 95% de las veces y lo que pide el criterio de aceptacion del plan. El motor
 * ya entiende `or` y `not`, asi que anadirlos es interfaz y no backend.
 */
export function buildFilter(
  conditions: EditableCondition[],
): TaskFilter | null {
  const usable = conditions.filter(
    (condition) =>
      condition.field !== "" &&
      (!operatorTakesValue(condition.operator) ||
        (condition.value !== undefined &&
          condition.value !== null &&
          condition.value !== "")),
  );

  // El `id` se queda aqui: la API no lo conoce y su validador rechaza las
  // claves que no espera.
  //
  // Y `type` se **pone**, no se propaga. El validador de `view.config` no lo
  // declara, asi que Valibot lo descarta al guardar: una vista guardada vuelve
  // sin el, y propagarlo producia un nodo sin `type` que el motor rechazaba con
  // un 400 —la pantalla en blanco que ese mismo validador queria evitar—.
  // Ponerlo aqui repara ademas las vistas ya guardadas, sin migracion.
  const clean: FilterCondition[] = usable.map((condition) => ({
    type: "condition",
    field: condition.field,
    operator: condition.operator,
    ...(condition.value !== undefined ? { value: condition.value } : {}),
  }));

  if (clean.length === 0) return null;
  if (clean.length === 1) return clean[0] as TaskFilter;

  return { type: "and", children: clean as TaskFilter[] };
}
