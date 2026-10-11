import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import type { Context } from "hono";
import db from "../database";
import { instanceAlertTable, jobStatusTable } from "../database/schema";
import { isRedisConfigured } from "../redis";
import { readAppVersion } from "../utils/app-version";
import { clientIp } from "../utils/client-ip";
import { rateLimitEnabled } from "../utils/rate-limit";
import {
  processStartedAt,
  serverErrorCount,
  slowestRoutes,
} from "../utils/route-metrics";
import { openConnectionCounts } from "../ws";
import { readBackupState } from "./backups";
import { findProblems } from "./health";

// Empaquetado, `dist/index.js`; con tsx, `src/instance/report.ts`.
const JOURNAL_CANDIDATES = [
  "../drizzle/meta/_journal.json",
  "../../drizzle/meta/_journal.json",
];

function bundledMigrations() {
  for (const candidate of JOURNAL_CANDIDATES) {
    try {
      const journal = JSON.parse(
        readFileSync(new URL(candidate, import.meta.url), "utf8"),
      ) as { entries?: unknown[] };
      if (Array.isArray(journal.entries)) return journal.entries.length;
    } catch {
      // El siguiente.
    }
  }
  return null;
}

async function databaseState() {
  const [size, version, applied] = await Promise.all([
    db.execute<{ bytes: string }>(
      sql`SELECT pg_database_size(current_database())::text AS bytes`,
    ),
    db.execute<{ server_version: string }>(sql`SHOW server_version`),
    db
      .execute<{ count: string }>(
        sql`SELECT count(*)::text AS count FROM drizzle.__drizzle_migrations`,
      )
      .catch(() => ({ rows: [] as { count: string }[] })),
  ]);
  return {
    sizeBytes: Number(size.rows[0]?.bytes ?? 0),
    version: version.rows[0]?.server_version ?? null,
    appliedMigrations: applied.rows[0] ? Number(applied.rows[0].count) : null,
    bundledMigrations: bundledMigrations(),
  };
}

const iso = (date: Date | null) => (date ? date.toISOString() : null);

/**
 * El estado de la instancia, para su admin (ADR 075). Todo lo que se puede
 * saber sin salir de la máquina: versión, base, trabajos programados, copias,
 * tiempo real, rutas lentas y alertas. Nada de esto lleva datos de los espacios
 * ni secretos.
 */
export async function buildInstanceReport(c: Context) {
  const [database, jobs, backups, alerts] = await Promise.all([
    databaseState(),
    db.select().from(jobStatusTable).orderBy(jobStatusTable.job),
    readBackupState(),
    db
      .select()
      .from(instanceAlertTable)
      .where(sql`${instanceAlertTable.resolvedAt} IS NULL`)
      .orderBy(instanceAlertTable.openedAt),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    version: readAppVersion() ?? null,
    revision: process.env.RIUNA_REVISION?.trim() || null,
    startedAt: processStartedAt.toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    node: process.version,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    schedulerEnabled: process.env.RIUNA_DISABLE_SCHEDULER !== "true",
    rateLimitEnabled: rateLimitEnabled(),
    database,
    jobs: jobs.map((job) => ({
      job: job.job,
      lastStatus: job.lastStatus,
      lastStartedAt: iso(job.lastStartedAt),
      lastFinishedAt: iso(job.lastFinishedAt),
      lastDurationMs: job.lastDurationMs,
      lastSuccessAt: iso(job.lastSuccessAt),
      consecutiveFailures: job.consecutiveFailures,
      lastError: job.lastError,
    })),
    backups,
    realtime: {
      redis: isRedisConfigured(),
      connections: openConnectionCounts(),
    },
    requests: {
      serverErrors: serverErrorCount(),
      slowest: slowestRoutes(),
    },
    problems: findProblems({ backups, jobs }),
    alerts: alerts.map((alert) => ({
      key: alert.key,
      message: alert.message,
      openedAt: alert.openedAt.toISOString(),
    })),
    // Para comprobar que el proxy de delante pasa la IP de quien llama: detrás
    // de `tailscale serve` debe salir la de Tailscale, no la de Docker.
    you: { ip: clientIp(c) },
  };
}
