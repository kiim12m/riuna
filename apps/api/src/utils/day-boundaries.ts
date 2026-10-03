import { type SQL, type SQLWrapper, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";

/**
 * La zona del proceso, la que decide que es "hoy" (`Europe/Madrid` en las
 * imagenes, ADR 049).
 */
export function serverTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Una columna `timestamp` sin zona -hora de pared UTC, el convenio de drizzle
 * y de los `now()` de la base- llevada a la hora de pared de la zona del
 * servidor, para cortar dias **en SQL** con el mismo criterio que
 * `startOfServerDay`. Sin esto `date_trunc('day', col)` corta en UTC: con la
 * API en Madrid, lo que pasa entre las 00:00 y las 02:00 caeria en la vispera
 * (ADR 049).
 */
export function serverWallTime(value: SQLWrapper): SQL {
  return sql`((${value} AT TIME ZONE 'UTC') AT TIME ZONE ${serverTimeZone()})`;
}

/**
 * El dia del servidor, que es el criterio que Riuna usa hoy para "vence hoy".
 *
 * `task.due_date` es un `timestamp` **sin zona**, asi que "hoy" depende de
 * donde se mire. La zona la fija la imagen de la API: `Europe/Madrid`, con
 * PostgreSQL en UTC (ADR 049). La zona por persona sigue siendo deuda. Lo
 * importante es que todas las superficies apliquen **el mismo** criterio: si
 * "Mi trabajo" y un panel calcularan sus fronteras por separado, la misma
 * tarea saldria vencida en una pantalla y no en la otra. Para cortar dias
 * dentro del SQL, `serverWallTime`.
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

/**
 * El ultimo instante del dia del servidor -`23:59:59.999`-, para las
 * consultas que acotan un rango con `BETWEEN` en vez de un limite exclusivo
 * (`addDays(startOfServerDay(now), 1)`, el idioma de `due-window.ts`). Sin
 * esto media docena de sitios repetian `setHours(23, 59, 59, 999)` cada uno
 * por su cuenta.
 */
export function endOfServerDay(now: Date): Date {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return end;
}

export function addDays(date: Date, days: number): Date {
  const shifted = new Date(date);
  shifted.setDate(shifted.getDate() + days);
  return shifted;
}

/**
 * Las claves `yyyy-mm-dd` de cada dia entre `windowStart` y `windowEnd`,
 * ambos incluidos. La tenia el Cronograma como funcion privada; el
 * Planificador la necesita igual para repartir `capacityByDay` por dia
 * (ADR 045), asi que se comparte en vez de duplicarla.
 */
export function dayKeysBetween(windowStart: Date, windowEnd: Date): string[] {
  const keys: string[] = [];
  let cursor = windowStart;
  while (cursor <= windowEnd) {
    keys.push(serverDayKey(cursor));
    cursor = addDays(cursor, 1);
  }
  return keys;
}

/**
 * La clave `yyyy-mm-dd` del dia del servidor para una fecha.
 *
 * **Nunca `toISOString().slice(0, 10)`**: eso da el dia en UTC, no en la zona
 * del servidor, y discrepa de `startOfServerDay` (local) durante casi toda la
 * jornada en cualquier servidor con offset distinto de cero. Es el mismo
 * calculo que `startOfServerDay`, expresado como texto.
 */
export function serverDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const DAY_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Punto de entrada unico para un dia que llega de un cliente.
 *
 * Un `yyyy-mm-dd` pelado es medianoche **local del servidor** para ese dia,
 * nunca UTC: `new Date("2026-09-16")` lo interpretaria como medianoche UTC, y
 * en un servidor con offset negativo eso cae en el dia anterior en hora local.
 * Un ISO completo se parsea como siempre y se normaliza con
 * `startOfServerDay`, para no romper llamadas que ya mandan un instante
 * completo con su propio reloj (por ejemplo, una integracion por clave de
 * API).
 */
export function parseServerDay(value: string, fieldName: string): Date {
  if (value.trim() === "") {
    throw new HTTPException(400, {
      message: `${fieldName} cannot be an empty string. Please provide a valid date or omit the field.`,
    });
  }

  const dayOnly = DAY_ONLY_PATTERN.exec(value);
  if (dayOnly) {
    const [, year, month, day] = dayOnly;
    return new Date(Number(year), Number(month) - 1, Number(day), 0, 0, 0, 0);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new HTTPException(400, {
      message: `Invalid ${fieldName} "${value}". Please provide a valid date string (e.g. "2025-01-15" or "2025-01-15T10:30:00Z").`,
    });
  }
  return startOfServerDay(parsed);
}

/**
 * El principio de la semana del servidor que contiene `now`.
 *
 * `weekStartsOn` es el mismo 0-6 (domingo a sabado) que la preferencia del
 * cliente, y por eso viaja desde alli: el calendario, el Gantt, el Cronograma y
 * los filtros ya leen esa preferencia, y una quinta nocion de "cuando empieza
 * la semana" que solo conociera el panel seria la que acabara discrepando.
 */
export function startOfServerWeek(now: Date, weekStartsOn: number): Date {
  const start = startOfServerDay(now);
  const offset = (start.getDay() - weekStartsOn + 7) % 7;
  return addDays(start, -offset);
}
