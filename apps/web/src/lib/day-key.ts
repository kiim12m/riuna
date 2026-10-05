/**
 * Un dia como `yyyy-mm-dd` **local**, nunca `toISOString()`: entre las 00:00 y
 * las 02:00 de Madrid este ultimo da la vispera (ADR 049). Coincide con
 * `serverDayKey` (`apps/api/src/utils/day-boundaries.ts`), que es la clave que
 * la API espera para un dia sin zona.
 */
export function dayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** La medianoche local de una clave `yyyy-mm-dd`. */
export function parseDayKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}
