import { addWeeks, endOfWeek, startOfWeek } from "date-fns";
import type { TaskFilter } from "@/types/task-filter";
import { dayKey } from "./day-key";

/**
 * Los menus de filtro del Tablero, la Lista y el Backlog, traducidos al
 * arbol que entiende el motor del servidor (ADR 014, ADR 065).
 *
 * Hasta aqui filtraban en el navegador, cada vista a su manera —el Backlog
 * incluso con otra semana y leyendo las etiquetas de una cache que casi
 * siempre estaba vacia—. Ahora las tres piden al servidor lo mismo que ya pedian
 * la Tabla, el Calendario y el Gantt.
 */
export type BoardFilters = {
  status: string[] | null;
  priority: string[] | null;
  assignee: string[] | null;
  team: string[] | null;
  epics: string[] | null;
  /** Ids de etiqueta del menu; se casan por **nombre** (ver `labelNames`). */
  labels: string[] | null;
  /** Valores de `DUE_DATE_FILTER_VALUES`. */
  dueDate: string[] | null;
};

export const DUE_DATE_FILTER_VALUES = {
  dueNextWeek: "dueNextWeek",
  dueThisWeek: "dueThisWeek",
  noDueDate: "noDueDate",
} as const;

type Options = {
  /** Lo que se escribe en el buscador del tablero. */
  text?: string;
  /** La clave del proyecto, para reconocer `DEP-23`. */
  projectSlug?: string;
  /** Primer dia de la semana de la persona (0 domingo, 1 lunes, 6 sabado). */
  weekStartsOn: 0 | 1 | 6;
  /** Id de etiqueta → nombre. Una etiqueta es una fila por tarea: lo que las une es el nombre. */
  labelNames?: ReadonlyMap<string, string>;
  now?: Date;
};

const condition = (
  field: string,
  operator: Extract<TaskFilter, { type: "condition" }>["operator"],
  value?: unknown,
): TaskFilter => ({
  type: "condition",
  field,
  operator,
  ...(value !== undefined ? { value } : {}),
});

const hasValues = (list: string[] | null | undefined): list is string[] =>
  Array.isArray(list) && list.length > 0;

function weekRange(base: Date, weekStartsOn: 0 | 1 | 6): TaskFilter {
  // Dias sueltos: el servidor los lee como el dia de su zona, de principio a
  // fin (punto 16 del cierre de la deuda).
  return {
    type: "and",
    children: [
      condition("dueDate", "gte", dayKey(startOfWeek(base, { weekStartsOn }))),
      condition("dueDate", "lte", dayKey(endOfWeek(base, { weekStartsOn }))),
    ],
  };
}

function dueDateFilter(
  values: string[],
  weekStartsOn: 0 | 1 | 6,
  now: Date,
): TaskFilter | null {
  const options: TaskFilter[] = [];

  for (const value of new Set(values)) {
    if (value === DUE_DATE_FILTER_VALUES.noDueDate) {
      options.push(condition("dueDate", "isEmpty"));
    } else if (value === DUE_DATE_FILTER_VALUES.dueThisWeek) {
      options.push(weekRange(now, weekStartsOn));
    } else if (value === DUE_DATE_FILTER_VALUES.dueNextWeek) {
      options.push(weekRange(addWeeks(now, 1), weekStartsOn));
    }
  }

  if (options.length === 0) return null;
  return options.length === 1
    ? (options[0] as TaskFilter)
    : { type: "or", children: options };
}

/**
 * El buscador: titulo o descripcion que contienen el texto, o el numero de la
 * tarea si lo que se escribe es un numero (`23`, `#23`) o su identificador
 * (`DEP-23`, solo si es de este proyecto).
 *
 * **Un numero casa con el numero exacto**, no con cualquiera que lo contenga: el
 * motor compara numeros, no cadenas, y «2» ya no trae la 12 ni la 20.
 */
function textFilter(
  raw: string,
  projectSlug: string | undefined,
): TaskFilter | null {
  const text = raw.trim();
  if (!text) return null;

  const options: TaskFilter[] = [
    condition("title", "contains", text),
    condition("description", "contains", text),
  ];

  const bare = /^#?(\d+)$/u.exec(text);
  const identifier = /^([\p{L}\p{N}_]+)-(\d+)$/u.exec(text);
  const number =
    bare?.[1] ??
    (identifier &&
    projectSlug &&
    identifier[1]?.toLowerCase() === projectSlug.toLowerCase()
      ? identifier[2]
      : undefined);

  if (number) options.push(condition("number", "eq", Number(number)));

  return { type: "or", children: options };
}

/**
 * Todos los filtros a la vez, en conjuncion. `null` cuando no hay ninguno, que es
 * como se pide el proyecto entero.
 */
export function buildTaskViewFilter(
  filters: Partial<BoardFilters>,
  options: Options,
): TaskFilter | null {
  const now = options.now ?? new Date();
  const parts: TaskFilter[] = [];

  if (hasValues(filters.status)) {
    parts.push(condition("status", "in", filters.status));
  }
  if (hasValues(filters.priority)) {
    parts.push(condition("priority", "in", filters.priority));
  }
  if (hasValues(filters.assignee)) {
    parts.push(condition("assignee", "in", filters.assignee));
  }
  if (hasValues(filters.team)) {
    parts.push(condition("team", "in", filters.team));
  }
  if (hasValues(filters.epics)) {
    parts.push(condition("epic", "in", filters.epics));
  }

  if (hasValues(filters.labels)) {
    const names = [
      ...new Set(
        filters.labels
          .map((id) => options.labelNames?.get(id))
          .filter((name): name is string => Boolean(name)),
      ),
    ];
    // Etiquetas elegidas que ya no existen: se piden cero tareas y no todas,
    // que es lo que un filtro que no casa con nada tiene que hacer.
    parts.push(
      names.length > 0
        ? condition("label", "in", names)
        : condition("label", "in", ["\u0000"]),
    );
  }

  if (hasValues(filters.dueDate)) {
    const due = dueDateFilter(filters.dueDate, options.weekStartsOn, now);
    if (due) parts.push(due);
  }

  const text = textFilter(options.text ?? "", options.projectSlug);
  if (text) parts.push(text);

  if (parts.length === 0) return null;
  return parts.length === 1
    ? (parts[0] as TaskFilter)
    : { type: "and", children: parts };
}
