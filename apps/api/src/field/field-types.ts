import * as v from "valibot";

// El vocabulario de tipos. La misma lista vive en un CHECK de la base
// (`field_definition_type_valid`), a proposito: aqui da mensajes de error
// utiles, y alli impide que un insert que no pase por este modulo cuele un
// tipo inventado.
export const FIELD_TYPES = [
  "text",
  "number",
  "currency",
  "select",
  "multi_select",
  "date",
  "checkbox",
  "user",
  "url",
  "relation",
  // Un campo calculado (ADR 090): su valor lo escribe la base a partir de una
  // formula, nunca una persona.
  "formula",
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

export const fieldTypeSchema = v.picklist(FIELD_TYPES);

// Los campos de tipo relacion no guardan nada en `task.custom_fields`: su
// valor son filas de `task_relation`, que si tiene integridad referencial. La
// definicion existe para que el campo aparezca en el formulario; el valor lo
// gestiona el modulo de relaciones. Ver ADR 013.
export function storesValueInJson(type: FieldType) {
  return type !== "relation";
}

/** Si su valor lo escribe quien edita la tarea. Uno calculado, no. */
export function isUserWritable(type: FieldType) {
  return type !== "relation" && type !== "formula";
}

const optionSchema = v.object({
  value: v.pipe(v.string(), v.minLength(1), v.maxLength(120)),
  label: v.pipe(v.string(), v.minLength(1), v.maxLength(120)),
  color: v.optional(v.nullable(v.string())),
});

// Que opciones distintas compartan `value` romperia la resolucion del valor
// guardado, que es justo lo que `value` identifica.
const optionsSchema = v.pipe(
  v.array(optionSchema),
  v.minLength(1, "A select field needs at least one option"),
  v.maxLength(200),
  v.check(
    (options) => new Set(options.map((o) => o.value)).size === options.length,
    "Option values must be unique",
  ),
);

const numberConfigSchema = v.pipe(
  v.object({
    min: v.optional(v.nullable(v.number())),
    max: v.optional(v.nullable(v.number())),
  }),
  v.check(
    (config) =>
      config.min == null || config.max == null || config.min <= config.max,
    "min must not be greater than max",
  ),
);

// ISO 4217 son tres letras. No se valida contra la lista real: mantenerla al
// dia seria una dependencia nueva para un problema que no hemos tenido.
const currencyConfigSchema = v.object({
  currency: v.pipe(v.string(), v.regex(/^[A-Z]{3}$/, "Use an ISO 4217 code")),
  min: v.optional(v.nullable(v.number())),
  max: v.optional(v.nullable(v.number())),
});

const emptyConfigSchema = v.object({});

// La formula llega aqui tal como la escribio alguien; su forma canonica, con
// claves en vez de nombres, la pone `prepareFormulaConfig`, que necesita la base
// para resolver los nombres.
const formulaConfigSchema = v.pipe(
  v.object({
    expression: v.pipe(v.string(), v.minLength(1), v.maxLength(500)),
    format: v.optional(v.picklist(["number", "currency", "percent"]), "number"),
    currency: v.optional(
      v.nullable(
        v.pipe(v.string(), v.regex(/^[A-Z]{3}$/, "Use an ISO 4217 code")),
      ),
    ),
  }),
  v.check(
    (config) => config.format !== "currency" || Boolean(config.currency),
    "A currency formula needs a currency code",
  ),
);

const configSchemas = {
  text: v.object({
    maxLength: v.optional(v.nullable(v.pipe(v.number(), v.minValue(1)))),
  }),
  number: numberConfigSchema,
  currency: currencyConfigSchema,
  select: v.object({ options: optionsSchema }),
  multi_select: v.object({ options: optionsSchema }),
  date: emptyConfigSchema,
  checkbox: emptyConfigSchema,
  user: emptyConfigSchema,
  url: emptyConfigSchema,
  relation: emptyConfigSchema,
  formula: formulaConfigSchema,
} as const satisfies Record<FieldType, unknown>;

export type FieldConfig<T extends FieldType = FieldType> = v.InferOutput<
  (typeof configSchemas)[T]
>;

/**
 * Valida la configuracion de una definicion contra su tipo. Devuelve la
 * configuracion ya normalizada —sin las claves que sobran— para que lo que se
 * guarda en `field_definition.config` sea exactamente lo que el tipo entiende.
 */
export function parseFieldConfig(type: FieldType, config: unknown) {
  const result = v.safeParse(configSchemas[type], config ?? {});

  if (!result.success) {
    const [issue] = result.issues;
    const path = issue?.path?.map((segment) => segment.key).join(".");
    const where = path ? ` at "${path}"` : "";
    throw new Error(
      `Invalid configuration for a "${type}" field${where}: ${issue?.message ?? "unknown error"}`,
    );
  }

  return result.output as Record<string, unknown>;
}

/**
 * La clave con la que el valor vive dentro del JSONB. Se genera una vez a
 * partir del nombre y ya no cambia nunca: renombrar el campo no puede
 * huerfanar lo que miles de tareas tienen guardado.
 */
export function slugifyFieldKey(name: string) {
  const slug = name
    .normalize("NFD")
    // Quita los diacriticos: "Presupuesto anual (€)" -> "presupuesto_anual"
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);

  return slug;
}
