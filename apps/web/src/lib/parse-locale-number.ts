/**
 * Lee un numero escrito a mano en la configuracion regional de quien lo escribe.
 *
 * `Number("1,5")` es `NaN` y `Number("1.500")` es 1,5: ninguno es lo que quiere
 * decir alguien que escribe en espanol. El separador de miles sale de `Intl`,
 * no de una tabla propia.
 *
 * - Con los dos separadores, el ultimo que aparece es el decimal: `1.500,50`.
 * - Solo el de miles y en forma estricta de miles (`1.500`, `12.000.000`): miles.
 * - Cualquier otro separador suelto es el decimal: `1,5` y `1.5` valen 1,5.
 *
 * Devuelve `null` cuando el texto no es un numero, nunca `NaN`.
 */
export function parseLocaleNumber(text: string, locale: string): number | null {
  // Los separadores de miles con espacio (el frances usa uno estrecho) se van
  // con el resto de blancos.
  const compact = text.replace(/\s/g, "");
  if (!/^[-+]?[\d.,]+$/.test(compact) || !/\d/.test(compact)) return null;

  const negative = compact.startsWith("-");
  const body = compact.replace(/^[-+]/, "");
  const lastDot = body.lastIndexOf(".");
  const lastComma = body.lastIndexOf(",");

  let normalized: string;

  if (lastDot !== -1 && lastComma !== -1) {
    const decimal = lastDot > lastComma ? "." : ",";
    const group = decimal === "." ? "," : ".";
    normalized = body.split(group).join("").replace(decimal, ".");
  } else if (lastDot !== -1 || lastComma !== -1) {
    const separator = lastDot !== -1 ? "." : ",";
    const pieces = body.split(separator);

    if (
      separator === groupSeparator(locale) &&
      /^\d{1,3}$/.test(pieces[0] ?? "") &&
      pieces.length > 1 &&
      pieces.slice(1).every((piece) => /^\d{3}$/.test(piece))
    ) {
      normalized = pieces.join("");
    } else if (pieces.length === 2) {
      normalized = pieces.join(".");
    } else {
      return null;
    }
  } else {
    normalized = body;
  }

  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return negative ? -value : value;
}

function groupSeparator(locale: string): string {
  return (
    new Intl.NumberFormat(locale)
      .formatToParts(12_345.6)
      .find((part) => part.type === "group")?.value ?? ","
  );
}
