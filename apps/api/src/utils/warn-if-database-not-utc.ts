import { sql } from "drizzle-orm";
import db from "../database";

/**
 * PostgreSQL tiene que quedarse en UTC aunque la API no lo este: `now()` en los
 * disparadores (`completed_at`) y los `DEFAULT now()` escriben la hora de pared
 * de la sesion en columnas sin zona, y drizzle las lee como UTC. Con la base en
 * Madrid, `completed_at` saldria dos horas corrido. No se corrige solo -seria
 * reescribir la configuracion de la base-, pero tampoco se calla (ADR 049).
 */
export async function warnIfDatabaseIsNotUtc() {
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
