import type { FieldType } from "../../field/field-types";
import { MULTI_VALUE_SEPARATOR, splitList } from "./format";

// Inferencia del tipo de una columna que no casa con ninguna columna reservada
// y va a convertirse en un campo personalizado.
//
// Esto **solo siembra** el desplegable del asistente: la ultima palabra es de
// quien importa. Es a proposito, y no por prudencia decorativa: `type` y `key`
// de una definicion son inmutables (ADR 013), asi que un tipo mal inferido no
// se corrige despues, solo se archiva el campo y se crea otro.
//
// Por eso mismo la inferencia es conservadora. Ante la duda, `text`: un numero
// guardado como texto se puede leer, y un codigo "00123" convertido en numero
// ha perdido los ceros para siempre.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SPANISH_DATE = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/;
const NUMERIC = /^-?\d+(?:[.,]\d+)?$/;
// Ceros a la izquierda: un codigo, no un numero. "0" solo si es el numero cero.
const LEADING_ZERO = /^-?0\d/;

const TRUTHY = new Set(["si", "sí", "yes", "true", "verdadero", "x", "1", "✓"]);
const FALSY = new Set(["no", "false", "falso", "0", "-", "✗"]);

/** Cuantos valores distintos se admiten antes de descartar `select`. */
const MAX_SELECT_OPTIONS = 20;
/** Repeticion minima: 20 valores distintos en 21 filas no son un desplegable. */
const MIN_SELECT_REPETITION = 3;

export type InferredColumn = {
  type: FieldType;
  /** Opciones propuestas cuando el tipo es `select` o `multi_select`. */
  options?: string[];
};

export function isDateLike(value: string): boolean {
  if (ISO_DATE.test(value)) {
    return !Number.isNaN(Date.parse(value));
  }

  const spanish = SPANISH_DATE.exec(value);
  if (!spanish) {
    return false;
  }

  const day = Number(spanish[1]);
  const month = Number(spanish[2]);
  return day >= 1 && day <= 31 && month >= 1 && month <= 12;
}

export function isNumberLike(value: string): boolean {
  if (!NUMERIC.test(value) || LEADING_ZERO.test(value)) {
    return false;
  }
  return Number.isFinite(Number(value.replace(",", ".")));
}

export function isBooleanLike(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return TRUTHY.has(normalized) || FALSY.has(normalized);
}

/**
 * Propone un tipo para una columna a partir de sus valores. Las celdas vacias
 * no cuentan: una columna a medio rellenar sigue teniendo un tipo.
 */
export function inferColumnType(values: readonly string[]): InferredColumn {
  const filled = values.map((value) => value.trim()).filter(Boolean);

  if (filled.length === 0) {
    return { type: "text" };
  }

  if (filled.every(isBooleanLike)) {
    return { type: "checkbox" };
  }

  if (filled.every(isDateLike)) {
    return { type: "date" };
  }

  if (filled.every(isNumberLike)) {
    return { type: "number" };
  }

  // Una columna con separadores es una lista siempre que las piezas se repitan
  // entre filas; si no, es texto libre que da la casualidad de llevar `;`.
  if (filled.some((value) => value.includes(MULTI_VALUE_SEPARATOR))) {
    const options = distinct(filled.flatMap((value) => splitList(value)));
    if (options && options.length <= MAX_SELECT_OPTIONS) {
      return { type: "multi_select", options };
    }
  }

  const options = distinct(filled);
  if (
    options &&
    options.length <= MAX_SELECT_OPTIONS &&
    filled.length >= options.length * MIN_SELECT_REPETITION
  ) {
    return { type: "select", options };
  }

  return { type: "text" };
}

/**
 * Valores distintos, o `null` en cuanto se pasan del techo. Cortar en cuanto se
 * sabe evita recorrer 5.000 filas de texto libre para descubrir que hay 5.000
 * valores distintos.
 */
function distinct(values: readonly string[]): string[] | null {
  const seen = new Set<string>();
  for (const value of values) {
    seen.add(value);
    if (seen.size > MAX_SELECT_OPTIONS) {
      return null;
    }
  }
  return [...seen];
}
