import * as v from "valibot";
import type { FieldType } from "./field-types";
import { storesValueInJson } from "./field-types";

export type FieldDefinitionLike = {
  key: string;
  name: string;
  type: FieldType;
  required: boolean;
  config: Record<string, unknown>;
};

export class FieldValidationError extends Error {
  readonly key: string;

  constructor(key: string, message: string) {
    super(message);
    this.name = "FieldValidationError";
    this.key = key;
  }
}

// JSONB no tiene tipo fecha, asi que una fecha se guarda como el texto
// `YYYY-MM-DD`. Es el unico formato que ordena igual como texto que como
// fecha, que es lo que permite ordenar por el campo sin convertir nada.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function optionValues(config: Record<string, unknown>) {
  const options = config.options;
  if (!Array.isArray(options)) return new Set<string>();
  return new Set(
    options
      .map((option) =>
        option && typeof option === "object"
          ? (option as { value?: unknown }).value
          : undefined,
      )
      .filter((value): value is string => typeof value === "string"),
  );
}

/**
 * Construye el esquema de un valor a partir de la fila de su definicion. Los
 * esquemas de Valibot se escriben estaticos; aqui el tipo y las opciones son
 * un dato que solo se conoce al leer la definicion, asi que el esquema se
 * compila en cada validacion.
 */
function buildValueSchema(definition: FieldDefinitionLike) {
  const { type, config } = definition;

  switch (type) {
    case "text": {
      const maxLength =
        typeof config.maxLength === "number" ? config.maxLength : 5_000;
      return v.pipe(v.string(), v.maxLength(maxLength));
    }
    case "number":
    case "currency": {
      let schema = v.pipe(
        v.number(),
        v.finite("Must be a finite number"),
      ) as v.GenericSchema<number, number>;
      if (typeof config.min === "number") {
        schema = v.pipe(schema, v.minValue(config.min)) as typeof schema;
      }
      if (typeof config.max === "number") {
        schema = v.pipe(schema, v.maxValue(config.max)) as typeof schema;
      }
      return schema;
    }
    case "select": {
      const allowed = optionValues(config);
      return v.pipe(
        v.string(),
        v.check(
          (value) => allowed.has(value),
          "Value is not one of the field's options",
        ),
      );
    }
    case "multi_select": {
      const allowed = optionValues(config);
      return v.pipe(
        v.array(v.string()),
        v.check(
          (values) => values.every((value) => allowed.has(value)),
          "One of the values is not among the field's options",
        ),
        v.check(
          (values) => new Set(values).size === values.length,
          "The same option cannot be selected twice",
        ),
      );
    }
    case "date":
      return v.pipe(
        v.string(),
        v.regex(ISO_DATE, "Use the YYYY-MM-DD format"),
        v.check(isRealDate, "That date does not exist"),
      );
    case "checkbox":
      return v.boolean();
    case "user":
      // Que el id exista y pertenezca al espacio de trabajo no se puede saber
      // sin consultar la base: lo comprueba el controlador, que si tiene
      // acceso, con `assertAssignableUser`.
      return v.pipe(v.string(), v.minLength(1));
    case "url":
      // El esquema del protocolo se comprueba con una regex y no
      // construyendo una `URL`: Valibot sigue ejecutando el resto del pipe
      // aunque `v.url()` ya haya fallado, asi que el constructor recibiria la
      // cadena invalida y lanzaria un TypeError en vez del error de campo.
      return v.pipe(
        v.string(),
        v.url("Must be a valid URL"),
        v.regex(/^https?:\/\//i, "Only http and https URLs are allowed"),
      );
    default:
      return v.never();
  }
}

function isCleared(value: unknown) {
  return value === null || value === undefined || value === "";
}

/**
 * Valida y normaliza un lote de valores contra las definiciones que aplican.
 *
 * `incoming` es parcial a proposito: lleva solo los campos que la peticion
 * quiere cambiar, y lo que no venga se conserva. Un valor nulo o vacio borra
 * la clave en vez de guardar un nulo, para que el JSONB no acumule lapidas de
 * campos que alguien vacio una vez.
 */
export function applyFieldValues({
  definitions,
  current,
  incoming,
}: {
  definitions: FieldDefinitionLike[];
  current: Record<string, unknown>;
  incoming: Record<string, unknown>;
}): Record<string, unknown> {
  const byKey = new Map(definitions.map((d) => [d.key, d]));
  const result = { ...current };

  for (const [key, rawValue] of Object.entries(incoming)) {
    const definition = byKey.get(key);

    if (!definition) {
      throw new FieldValidationError(key, `Unknown field "${key}"`);
    }

    if (!storesValueInJson(definition.type)) {
      throw new FieldValidationError(
        key,
        `"${definition.name}" is a relation field; its value lives in task relations, not in custom fields`,
      );
    }

    if (isCleared(rawValue)) {
      if (definition.required) {
        throw new FieldValidationError(key, `"${definition.name}" is required`);
      }
      delete result[key];
      continue;
    }

    const parsed = v.safeParse(buildValueSchema(definition), rawValue);

    if (!parsed.success) {
      const [issue] = parsed.issues;
      throw new FieldValidationError(
        key,
        `"${definition.name}": ${issue?.message ?? "invalid value"}`,
      );
    }

    result[key] = parsed.output;
  }

  return result;
}

/**
 * Comprueba que no falte ningun campo obligatorio. Va aparte de
 * `applyFieldValues` porque solo aplica al crear: al editar una tarea se
 * mandan los campos que cambian, y exigir alli los obligatorios impediria
 * tocar cualquier otra cosa de una tarea a la que le falte uno —por ejemplo
 * una anterior a que el campo se declarase obligatorio—.
 */
export function assertRequiredFieldsPresent({
  definitions,
  values,
}: {
  definitions: FieldDefinitionLike[];
  values: Record<string, unknown>;
}) {
  for (const definition of definitions) {
    if (!definition.required) continue;
    if (!storesValueInJson(definition.type)) continue;
    if (isCleared(values[definition.key])) {
      throw new FieldValidationError(
        definition.key,
        `"${definition.name}" is required`,
      );
    }
  }
}
