import type { TFunction } from "i18next";
import type { FieldDefinition } from "./custom-field-cell";

export type TableColumnOption = {
  id: string;
  label: string;
  kind: "base" | "custom" | "aggregate";
};

/** Las cinco de siempre. `title` no se puede ocultar: sin ella no hay fila. */
export const BASE_COLUMN_IDS = [
  "title",
  "status",
  "priority",
  "assignee",
  "dueDate",
] as const;

export const REQUIRED_COLUMN_ID = "title";

/**
 * Las columnas que ofrece la tabla de un proyecto: las fijas, una por campo
 * personalizado y los agregados del arbol. Estos ultimos resumen la **rama**
 * de cada tarea —no solo la tarea—, y de los campos solo los que se pueden
 * sumar (numericos y de moneda).
 */
export function availableColumns(
  definitions: FieldDefinition[],
  t: TFunction,
): TableColumnOption[] {
  const base = BASE_COLUMN_IDS.map<TableColumnOption>((id) => ({
    id,
    label: t(`tasks:table.columns.${id}`),
    kind: "base",
  }));

  const custom = definitions.map<TableColumnOption>((definition) => ({
    id: `custom.${definition.key}`,
    label: definition.name,
    kind: "custom",
  }));

  const aggregate: TableColumnOption[] = [
    {
      id: "agg.progress",
      label: t("tasks:table.aggregates.progress"),
      kind: "aggregate",
    },
    {
      id: "agg.descendants",
      label: t("tasks:table.aggregates.descendants"),
      kind: "aggregate",
    },
    {
      id: "agg.estimate",
      label: t("tasks:table.aggregates.estimate"),
      kind: "aggregate",
    },
    ...definitions
      .filter(
        (definition) =>
          definition.type === "number" || definition.type === "currency",
      )
      .map<TableColumnOption>((definition) => ({
        id: `agg.sum.${definition.key}`,
        label: t("tasks:table.aggregates.sum", { name: definition.name }),
        kind: "aggregate",
      })),
  ];

  return [...base, ...custom, ...aggregate];
}

/** Lo que se ve cuando nadie ha elegido: las fijas y los campos, sin agregados. */
export function defaultColumnIds(options: TableColumnOption[]) {
  return options
    .filter((option) => option.kind !== "aggregate")
    .map((option) => option.id);
}

/**
 * Las columnas visibles, a partir de lo que dice la URL o la vista guardada.
 * Sin dato, las de siempre. Un id que ya no existe —un campo que se archivo
 * despues de guardar la vista— se ignora en vez de fallar, y `title` siempre
 * esta.
 */
export function resolveVisibleColumns(
  saved: string[] | undefined,
  options: TableColumnOption[],
): Set<string> {
  const known = new Set(options.map((option) => option.id));
  const chosen = saved ? saved.filter((id) => known.has(id)) : null;
  const ids = chosen ?? defaultColumnIds(options);

  return new Set([REQUIRED_COLUMN_ID, ...ids]);
}

/**
 * Marca o desmarca una columna. Devuelve `undefined` cuando el resultado es el
 * de siempre, para que la URL —y la vista que se guarde— no lleve nada que no
 * se haya elegido.
 */
export function toggleColumn(
  current: string[] | undefined,
  options: TableColumnOption[],
  id: string,
): string[] | undefined {
  if (id === REQUIRED_COLUMN_ID) return current;

  const visible = resolveVisibleColumns(current, options);
  if (visible.has(id)) visible.delete(id);
  else visible.add(id);

  // En el orden en que se ofrecen, no en el de los clics.
  const next = options
    .map((option) => option.id)
    .filter((optionId) => visible.has(optionId));

  const defaults = defaultColumnIds(options);
  const same =
    next.length === defaults.length &&
    next.every((optionId, index) => optionId === defaults[index]);

  return same ? undefined : next;
}
