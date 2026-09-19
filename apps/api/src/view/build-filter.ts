import type { EditableCondition } from "./filter-schema";
import type { FilterNode } from "./filter-to-sql";

/**
 * Envuelve una lista de condiciones en edicion en el arbol que el traductor
 * espera.
 *
 * **Es la segunda implementacion de esto.** La primera vive en el web
 * (`apps/web/src/types/task-filter/index.ts`), porque `apps/web` no depende de
 * `apps/api` y el contrato lo sostienen las pruebas y el 400 del servidor. Aqui
 * hace falta porque un widget guarda su filtro en forma editable y lo compila
 * el servidor, sin navegador de por medio. La prueba de paridad
 * (`tests/api/view/build-filter.test.ts`) es lo que impide que diverjan; si
 * apareciera una tercera, toca extraerlo a `packages/libs`.
 *
 * Solo construye conjunciones, igual que la del web: el motor entiende `or` y
 * `not`, pero ofrecerlos es interfaz y no backend.
 */
export function buildFilter(
  conditions: readonly EditableCondition[],
): FilterNode | null {
  // Se descartan **antes** de contar: una condicion a medio escribir no debe
  // decidir si el resultado es un nodo suelto o un `and`.
  const usable = conditions.filter(
    (condition) =>
      condition.field !== "" &&
      (!operatorTakesValue(condition.operator) ||
        (condition.value !== undefined &&
          condition.value !== null &&
          condition.value !== "")),
  );

  // El `id` es de la interfaz y se queda fuera: el validador del arbol no lo
  // espera y lo rechazaria.
  const clean: FilterNode[] = usable.map((condition) => ({
    type: "condition",
    field: condition.field,
    operator: condition.operator,
    ...(condition.value !== undefined ? { value: condition.value } : {}),
  }));

  const [only] = clean;
  if (!only) return null;
  // Una sola condicion se queda suelta, no envuelta en un `and` de un hijo.
  if (clean.length === 1) return only;

  return { type: "and", children: clean };
}

export function operatorTakesValue(operator: EditableCondition["operator"]) {
  return operator !== "isEmpty" && operator !== "isNotEmpty";
}
