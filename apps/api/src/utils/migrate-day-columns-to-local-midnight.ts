import { sql } from "drizzle-orm";
import db from "../database";
import { serverTimeZone } from "./day-boundaries";

/**
 * Las columnas que guardan **un dia** como la medianoche del servidor
 * (`parseServerDay`) y que se comparan por igualdad exacta o como frontera de
 * dia: `eq(plannedDate, todayStart)` en Hoy, el orden del Planificador y la
 * fecha limite de un bloque repetido.
 *
 * `task.due_date` y el resto de fechas no estan aqui a proposito: se comparan
 * por rangos, y una medianoche UTC sigue cayendo dentro del mismo dia de
 * Madrid -a las 02:00-.
 */
const DAY_COLUMNS = [
  { table: "personal_plan_entry", column: "planned_date" },
  { table: "schedule_block", column: "planned_date" },
  { table: "schedule_block", column: "ends_at" },
] as const;

/**
 * Lleva los dias guardados con la medianoche UTC a la medianoche de la zona
 * del proceso (ADR 049).
 *
 * Hasta la ADR 049 la API corria en UTC -nada fijaba `TZ` en las imagenes-, asi
 * que `parseServerDay("2026-10-01")` guardaba `2026-10-01 00:00`. Con la API en
 * `Europe/Madrid` ese mismo dia es `2026-09-30 22:00` -o `23:00` en invierno-, y
 * una fila vieja dejaria de casar con `eq(plannedDate, ...)`: el plan de hoy y
 * su orden se romperian en silencio para todo lo planificado antes del cambio.
 *
 * **Idempotente:** solo toca filas a las 00:00 exactas cuya medianoche local
 * sea otra hora, y en Madrid la medianoche nunca cae a las 00:00 UTC, asi que
 * una segunda vuelta no encuentra nada. En UTC, o en un dia cuya medianoche
 * local coincide con la UTC, la conversion es la identidad y el
 * `IS DISTINCT FROM` descarta la fila sin escribirla. Dos replicas arrancando a
 * la vez tampoco chocan: la segunda reevalua el `WHERE` tras el bloqueo de fila
 * y ya no la ve.
 *
 * Las filas que ya estaban a las 22:00 o 23:00 -las que el navegador mandaba con
 * su propia medianoche antes del arreglo del 2026-09-23- no se tocan: con la API
 * en Madrid pasan a ser, por fin, la medianoche del dia que se quiso decir.
 *
 * **Volver a UTC no es simetrico**: exigiria la conversion inversa y no se
 * automatiza.
 */
export async function migrateDayColumnsToLocalMidnight(
  timeZone = serverTimeZone(),
): Promise<Record<string, number>> {
  const converted: Record<string, number> = {};

  for (const { table, column } of DAY_COLUMNS) {
    const target = sql`(${sql.identifier(column)}::date::timestamp AT TIME ZONE ${timeZone}) AT TIME ZONE 'UTC'`;
    const result = await db.execute(sql`
      UPDATE ${sql.identifier(table)}
      SET ${sql.identifier(column)} = ${target}
      WHERE ${sql.identifier(column)}::time = '00:00'
        AND ${target} IS DISTINCT FROM ${sql.identifier(column)}
    `);
    converted[`${table}.${column}`] = result.rowCount ?? 0;
  }

  const total = Object.values(converted).reduce((sum, n) => sum + n, 0);
  if (total > 0) {
    console.log(
      `🕛 ${total} dia(s) guardados en medianoche UTC pasan a la medianoche de ${timeZone}:`,
      converted,
    );
  }

  await warnIfDatabaseIsNotUtc();

  return converted;
}

/**
 * PostgreSQL tiene que quedarse en UTC aunque la API no lo este: `now()` en los
 * disparadores (`completed_at`) y los `DEFAULT now()` escriben la hora de pared
 * de la sesion en columnas sin zona, y drizzle las lee como UTC. Con la base en
 * Madrid, `completed_at` saldria dos horas corrido. No se corrige solo -seria
 * reescribir la configuracion de la base-, pero tampoco se calla.
 */
async function warnIfDatabaseIsNotUtc() {
  const result = await db.execute(sql`SHOW timezone`);
  const zone = String(
    (result.rows[0] as { TimeZone?: string } | undefined)?.TimeZone ?? "",
  );
  if (zone && !["UTC", "Etc/UTC", "GMT", "Etc/GMT"].includes(zone)) {
    console.warn(
      `⚠️ PostgreSQL esta en la zona "${zone}" y Riuna espera UTC: las fechas que escribe la base (completed_at, created_at) saldran corridas. Ver docs/adr/049.`,
    );
  }
}
