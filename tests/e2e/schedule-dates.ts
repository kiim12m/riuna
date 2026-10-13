/**
 * Fechas de la planificacion para las pruebas de la tanda 2: siempre en dias
 * laborables futuros, para que ni el fin de semana ni el dia de hoy cambien
 * lo que se espera.
 */

/** El lunes de dentro de una o dos semanas, a medianoche local. */
export function upcomingMonday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + ((8 - date.getDay()) % 7 || 7) + 7);
  return date;
}

export function plusDays(base: Date, days: number) {
  const date = new Date(base);
  date.setDate(date.getDate() + days);
  return date;
}

/** `yyyy-mm-dd` local, como lo cuenta la API (ADR 049). */
export function localDay(value: Date | string | null) {
  if (!value) return null;
  const date = new Date(value);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}
