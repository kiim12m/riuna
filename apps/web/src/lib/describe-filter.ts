import type { TFunction } from "i18next";
import {
  type EditableCondition,
  type FilterableField,
  operatorTakesValue,
} from "@/types/task-filter";

/**
 * El filtro en palabras, para el subtitulo de un PDF (ADR 091): «Épica es
 * Fase 1 · Prioridad es Alta». Una opcion se nombra por su etiqueta, no por su
 * id, y una lista se une con comas.
 */
export function describeConditions(
  conditions: EditableCondition[],
  fields: FilterableField[],
  t: TFunction,
) {
  const byKey = new Map(fields.map((field) => [field.key, field]));

  return conditions
    .map((condition) => {
      const field = byKey.get(condition.field);
      const operator = t(`tasks:table.operators.${condition.operator}`);
      const label = field?.label ?? condition.field;
      if (!operatorTakesValue(condition.operator)) {
        return `${label} ${operator}`;
      }
      const values = Array.isArray(condition.value)
        ? condition.value
        : [condition.value];
      const shown = values
        .filter((value) => value !== "" && value != null)
        .map(
          (value) =>
            field?.options?.find((option) => option.value === String(value))
              ?.label ?? String(value),
        );
      return shown.length > 0
        ? `${label} ${operator} ${shown.join(", ")}`
        : null;
    })
    .filter((part): part is string => part !== null)
    .join(" · ");
}
