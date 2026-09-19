/**
 * El dia del servidor, que es el criterio que Riuna usa hoy para "vence hoy".
 *
 * `task.due_date` es un `timestamp` **sin zona**, asi que "hoy" depende de
 * donde se mire. Que zona horaria define un dia sigue sin decidirse —esta
 * anotado como deuda abierta de la Fase 4.5, junto con `dueDate eq <dia>`— y
 * mientras tanto lo importante es que todas las superficies apliquen **el
 * mismo** criterio: si "Mi trabajo" y un panel calcularan sus fronteras por
 * separado, la misma tarea saldria vencida en una pantalla y no en la otra.
 *
 * Y las fronteras se pasan como parametros y no se calculan con `now()` en la
 * SQL: `now()` usa la zona del servidor de base de datos mientras que un `Date`
 * enlazado viaja por el convenio UTC de drizzle, y mezclarlos desplaza el dia.
 */
export function startOfServerDay(now: Date): Date {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return start;
}

export function addDays(date: Date, days: number): Date {
  const shifted = new Date(date);
  shifted.setDate(shifted.getDate() + days);
  return shifted;
}
