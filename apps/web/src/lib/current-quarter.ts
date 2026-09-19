import { format } from "date-fns";

/**
 * El trimestre de `now` como dias `yyyy-MM-dd`, que es el periodo que un
 * objetivo propone por defecto.
 *
 * Se formatea en la zona local. `toISOString()` pasaba las medianoches locales a
 * UTC y, al este de Greenwich —Espana incluida—, el trimestre empezaba y acababa
 * un dia antes: el tercero iba del 30 de junio al 29 de septiembre.
 */
export function currentQuarter(now = new Date()) {
  const firstMonth = Math.floor(now.getMonth() / 3) * 3;
  const start = new Date(now.getFullYear(), firstMonth, 1);
  const end = new Date(now.getFullYear(), firstMonth + 3, 0);

  return {
    start: format(start, "yyyy-MM-dd"),
    end: format(end, "yyyy-MM-dd"),
  };
}
