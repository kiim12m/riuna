import { slugifyFieldKey } from "../../field/field-types";

// El vocabulario de columnas del formato de intercambio, y el unico sitio que
// lo conoce. Tanto el escritor como el lector salen de esta tabla, de modo que
// una columna nueva se anade una vez y aparece en los dos sentidos.
//
// Ver la ADR 017. Lo que no esta aqui es un campo personalizado: cualquier
// cabecera que no case con una de estas se convierte en la clave de un campo
// con `slugifyFieldKey`.

/** Separador de las columnas que llevan varios valores en una celda. */
export const MULTI_VALUE_SEPARATOR = ";";

export const EXCHANGE_FIELDS = [
  "id",
  "key",
  "reference",
  "outline",
  "title",
  "description",
  "descriptionHtml",
  "status",
  "priority",
  "assignee",
  "assignees",
  "team",
  "epics",
  "labels",
  "startDate",
  "dueDate",
  "estimateHours",
] as const;

export type ExchangeField = (typeof EXCHANGE_FIELDS)[number];

export type ColumnSpec = {
  field: ExchangeField;
  /** Cabecera canonica que escribe el export. */
  header: string;
  /** Otras cabeceras que el import acepta, ya normalizadas. */
  aliases: string[];
  /** Se exporta como ayuda de lectura y el import la ignora. */
  readOnly?: boolean;
  /** La celda lleva una lista separada por `MULTI_VALUE_SEPARATOR`. */
  multi?: boolean;
  /** Se oculta en la hoja de calculo. En CSV no hay columnas ocultas. */
  hidden?: boolean;
};

// El orden de esta lista es el orden de las columnas en el fichero exportado.
export const EXCHANGE_COLUMNS: ColumnSpec[] = [
  { field: "id", header: "ID", aliases: ["identificador", "task_id"] },
  // La clave legible (`norte-12`) se exporta para que un humano pueda citar una
  // tarea, pero es derivada: quien manda es `ID`.
  { field: "key", header: "Clave", aliases: ["key", "referencia_riuna"] },
  {
    field: "reference",
    header: "Referencia",
    aliases: ["reference", "referencia_externa", "external_id", "id_externo"],
  },
  {
    field: "outline",
    header: "Esquema",
    aliases: ["outline", "wbs", "esquema_numerico", "numeracion", "nivel"],
  },
  { field: "title", header: "Título", aliases: ["title", "tarea", "concepto"] },
  {
    field: "description",
    header: "Descripción",
    aliases: ["description", "detalle"],
  },
  {
    field: "descriptionHtml",
    header: "Descripción (HTML)",
    aliases: ["description_html", "descripcion_enriquecida"],
    hidden: true,
  },
  { field: "status", header: "Estado", aliases: ["status", "columna"] },
  { field: "priority", header: "Prioridad", aliases: ["priority"] },
  {
    field: "assignee",
    header: "Responsable",
    aliases: ["assignee", "responsable_principal", "asignado_a"],
  },
  {
    field: "assignees",
    header: "Asignados",
    aliases: ["assignees", "participantes"],
    multi: true,
  },
  { field: "team", header: "Equipo", aliases: ["team", "departamento"] },
  {
    field: "epics",
    header: "Épicas",
    aliases: ["epics", "epica", "epic"],
    multi: true,
  },
  {
    field: "labels",
    header: "Etiquetas",
    aliases: ["labels", "label", "etiqueta"],
    multi: true,
  },
  {
    field: "startDate",
    header: "Fecha inicio",
    aliases: ["start_date", "startdate", "inicio", "fecha_de_inicio"],
  },
  {
    field: "dueDate",
    header: "Fecha límite",
    aliases: ["due_date", "duedate", "vencimiento", "fecha_fin"],
  },
  {
    field: "estimateHours",
    header: "Estimación (h)",
    aliases: ["estimate", "estimacion", "horas", "estimacion_horas"],
  },
];

const COLUMNS_BY_FIELD = new Map(
  EXCHANGE_COLUMNS.map((column) => [column.field, column]),
);

export function columnFor(field: ExchangeField): ColumnSpec {
  const column = COLUMNS_BY_FIELD.get(field);
  if (!column) {
    throw new Error(`No column spec for "${field}"`);
  }
  return column;
}

/**
 * Normaliza una cabecera para compararla. Es deliberadamente `slugifyFieldKey`:
 * asi la cabecera que no casa con ninguna columna reservada produce, con la
 * misma funcion, la clave del campo personalizado que la va a recibir. Dos
 * normalizaciones distintas dejarian que "Fecha limite" casara como reservada y
 * "Fecha Limite " no.
 */
export function normalizeHeader(header: string): string {
  return slugifyFieldKey(header);
}

const COLUMNS_BY_NORMALIZED_HEADER = new Map<string, ColumnSpec>();
for (const column of EXCHANGE_COLUMNS) {
  COLUMNS_BY_NORMALIZED_HEADER.set(normalizeHeader(column.header), column);
  for (const alias of column.aliases) {
    COLUMNS_BY_NORMALIZED_HEADER.set(normalizeHeader(alias), column);
  }
}

export type HeaderMatch =
  | { kind: "reserved"; column: ColumnSpec }
  | { kind: "custom"; key: string }
  | { kind: "ignored" };

/**
 * A que va a parar una cabecera del fichero. `ignored` es la cabecera vacia
 * —una columna sin titulo, que Excel produce con facilidad— y la que se queda
 * sin clave utilizable tras normalizar ("###", "€").
 */
export function matchHeader(header: string): HeaderMatch {
  const normalized = normalizeHeader(header);

  if (!normalized) {
    return { kind: "ignored" };
  }

  const column = COLUMNS_BY_NORMALIZED_HEADER.get(normalized);
  if (column) {
    return { kind: "reserved", column };
  }

  return { kind: "custom", key: normalized };
}

/** Trocea una celda multivalor. Vacias fuera, espacios recortados, sin repetir. */
export function splitList(value: string | null | undefined): string[] {
  if (!value) {
    return [];
  }

  const seen = new Set<string>();
  for (const part of value.split(MULTI_VALUE_SEPARATOR)) {
    const trimmed = part.trim();
    if (trimmed) {
      seen.add(trimmed);
    }
  }

  return [...seen];
}

/**
 * Compone una celda multivalor. El separador se sustituye por una coma dentro
 * de cada valor: una etiqueta llamada "urgente; hoy" partiria la celda en dos
 * al releerla, y perder el punto y coma es menos danino que perder el valor.
 */
export function formatList(values: readonly string[]): string {
  return values
    .map((value) => value.replaceAll(MULTI_VALUE_SEPARATOR, ",").trim())
    .filter(Boolean)
    .join(`${MULTI_VALUE_SEPARATOR} `);
}

// Las etiquetas de prioridad tal como las escribe la interfaz
// (`tasks.priority.*` de `i18n/es-ES.json`). El export emite la etiqueta, que
// es lo que un humano espera leer en la celda; el import acepta la etiqueta y
// tambien el valor crudo, para que un fichero hecho contra la API tambien
// entre.
//
// La hoja no se traduce: la genera la API, que no tiene locale, igual que ya
// hace la plantilla de SERVITEC.
export const PRIORITY_LABELS: Record<string, string> = {
  "no-priority": "Sin prioridad",
  low: "Baja",
  medium: "Media",
  high: "Alta",
  urgent: "Urgente",
};

const PRIORITY_BY_LABEL = new Map<string, string>();
for (const [value, label] of Object.entries(PRIORITY_LABELS)) {
  PRIORITY_BY_LABEL.set(normalizeHeader(label), value);
  PRIORITY_BY_LABEL.set(normalizeHeader(value), value);
}

/** El valor de prioridad que nombra una celda, o `null` si no nombra ninguno. */
export function matchPriority(text: string): string | null {
  return PRIORITY_BY_LABEL.get(normalizeHeader(text)) ?? null;
}
