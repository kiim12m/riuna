// Conversion de fechas para las hojas de calculo, compartida por el motor de
// intercambio y por la plantilla de SERVITEC, que fue quien la descubrio.
//
// Excel guarda un dia como un numero de serie, y ExcelJS lo deriva de
// `getTime()` sin ajustar la zona. Asi que el valor tiene que ser la medianoche
// UTC del dia que nombraria alguien en Madrid: eso cae en un numero de serie
// entero y da el mismo dia corra el contenedor donde corra.

export const TIME_ZONE = "Europe/Madrid";

const dateParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function toSheetDate(value: Date | null): Date | null {
  if (!value) return null;
  const [year, month, day] = dateParts.format(value).split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day));
}

export function formatSheetDate(value: Date): string {
  const [year, month, day] = dateParts.format(value).split("-");
  return `${day}/${month}/${year}`;
}

// `en-CA` ya formatea como YYYY-MM-DD, que es lo que quieren los nombres de
// fichero y el formato de intercambio.
export function formatSheetDateIso(value: Date): string {
  return dateParts.format(value);
}

/**
 * Lee una fecha de una celda: el `Date` que ExcelJS ya devuelve para una celda
 * con formato de fecha, o el texto de un CSV. Devuelve el dia en la misma
 * convencion que `toSheetDate` escribe, o `null` si no se entiende.
 *
 * Acepta ISO (`2026-08-30`) y la notacion espanola (`30/08/2026`), que son las
 * dos que una hoja de esta casa produce.
 */
export function parseSheetDate(value: Date | string | null): Date | null {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : toSheetDate(value);
  }

  const trimmed = value.trim();
  if (!trimmed) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (iso) {
    return utcDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }

  const spanish = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(trimmed);
  if (spanish) {
    return utcDate(Number(spanish[3]), Number(spanish[2]), Number(spanish[1]));
  }

  return null;
}

function utcDate(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  // Rechaza el 31 de febrero, que `Date.UTC` desplazaria a marzo en silencio.
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return date;
}
