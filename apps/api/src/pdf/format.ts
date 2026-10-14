// Como se lee cada dato en un PDF (ADR 091). Un PDF se imprime y se firma: los
// valores van como los escribiria una persona en castellano, no como se
// guardan. La zona es la del proceso, Madrid (ADR 049).

const LOCALE = "es-ES";

const dayMonth = new Intl.DateTimeFormat(LOCALE, {
  day: "numeric",
  month: "short",
});
const dayMonthYear = new Intl.DateTimeFormat(LOCALE, {
  day: "numeric",
  month: "short",
  year: "numeric",
});
const weekdayDayMonth = new Intl.DateTimeFormat(LOCALE, {
  weekday: "short",
  day: "numeric",
  month: "short",
});
const longDate = new Intl.DateTimeFormat(LOCALE, {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const numeric = new Intl.DateTimeFormat(LOCALE, {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const clock = new Intl.DateTimeFormat(LOCALE, {
  hour: "numeric",
  minute: "2-digit",
});

function asDate(value: Date | string | null | undefined) {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// `Intl` escribe «oct.» en algunas versiones de ICU y «oct» en otras.
const tidy = (text: string) => text.replace(/\./g, "");

/** «26 oct», o «26 oct 2025» si no es de este ano. */
export function formatDay(value: Date | string | null | undefined) {
  const date = asDate(value);
  if (!date) return "";
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return tidy((sameYear ? dayMonth : dayMonthYear).format(date));
}

/** «lun 5 oct». */
export function formatWeekday(value: Date | string) {
  const date = asDate(value);
  return date ? tidy(weekdayDayMonth.format(date)).replace(",", "") : "";
}

/** «lunes 5 de octubre de 2026». */
export function formatLongDate(value: Date | string) {
  const date = asDate(value);
  return date ? longDate.format(date).replace(",", "") : "";
}

/** «8:30». */
export function formatClock(value: Date | string | null | undefined) {
  const date = asDate(value);
  return date ? clock.format(date) : "";
}

/** «Generado el 12/10/2026 a las 13:40». */
export function formatGeneratedAt(value: Date) {
  return `Generado el ${numeric.format(value)} a las ${clock.format(value)}`;
}

/** Un intervalo de fechas: «26 oct – 30 oct», o solo una punta. */
export function formatRange(
  start: Date | string | null | undefined,
  end: Date | string | null | undefined,
) {
  const from = formatDay(start);
  const to = formatDay(end);
  if (from && to) return from === to ? from : `${from} – ${to}`;
  return from || to;
}

/** «20 h 15 min», «64 h», «30 min». Cero es «0 h». */
export function formatHours(seconds: number | null | undefined) {
  if (seconds == null) return "";
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0 && rest === 0) return "0 h";
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 }).format(
    value,
  );
}

export function formatMoney(value: number, currency = "EUR") {
  try {
    return new Intl.NumberFormat(LOCALE, {
      style: "currency",
      currency,
    }).format(value);
  } catch {
    return `${formatNumber(value)} ${currency}`;
  }
}

export function formatPercent(value: number) {
  return new Intl.NumberFormat(LOCALE, {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value);
}

type Option = { value: string; label: string };

export type FieldLike = {
  type: string;
  config: Record<string, unknown> | null;
};

/**
 * El valor de un campo personalizado tal como se lee: la etiqueta de la
 * opcion, el nombre de la persona, la moneda con su simbolo y un calculado con
 * su formato (ADR 090).
 */
export function formatFieldValue(
  definition: FieldLike,
  value: unknown,
  nameOf: (userId: string) => string | undefined,
): string {
  if (value === null || value === undefined || value === "") return "";
  const config = definition.config ?? {};
  const options = (
    Array.isArray(config.options) ? config.options : []
  ) as Option[];
  const labelOf = (id: unknown) =>
    options.find((option) => option.value === id)?.label ?? String(id);
  const currency =
    typeof config.currency === "string" ? config.currency : "EUR";

  switch (definition.type) {
    case "number":
      return typeof value === "number" ? formatNumber(value) : String(value);
    case "currency":
      return typeof value === "number"
        ? formatMoney(value, currency)
        : String(value);
    case "formula":
      if (typeof value !== "number") return String(value);
      if (config.format === "currency") return formatMoney(value, currency);
      if (config.format === "percent") return formatPercent(value);
      return formatNumber(value);
    case "date":
      return typeof value === "string"
        ? formatDay(new Date(`${value}T00:00:00`))
        : String(value);
    case "checkbox":
      return value === true ? "Sí" : "No";
    case "select":
      return labelOf(value);
    case "multi_select":
      return Array.isArray(value) ? value.map(labelOf).join(", ") : "";
    case "user":
      return nameOf(String(value)) ?? "";
    default:
      return String(value);
  }
}

/** El nombre de un fichero sin lo que un sistema de ficheros no acepta. */
export function fileSafe(text: string) {
  return (
    text
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 60) || "documento"
  );
}
