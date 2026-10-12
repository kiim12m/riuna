import { sql } from "drizzle-orm";
import db from "../database";
import { jobStatusTable } from "../database/schema";
import { log } from "../utils/log";

export type JobRunStatus = "ok" | "degraded" | "error";

const MAX_ERROR_LENGTH = 500;

/**
 * El texto de un error, sin lo que pueda ser secreto (`AGENTS.md`). Lo lee el
 * admin de instancia, y va en el texto de la alerta que sale por sus canales.
 *
 * - Un error de Drizzle acaba en `params: <valores>`, y esos valores son
 *   cualquier dato de la consulta: se corta ahi.
 * - Una URL se queda en su origen: el token de un chat o de un webhook va a
 *   veces en la consulta y a veces en la ruta (`/bot<token>/` de Telegram, las
 *   de Discord y Slack). Quitar solo la consulta no bastaba (revision de la
 *   Fase 9).
 */
export function errorText(error: unknown) {
  const text = error instanceof Error ? error.message : String(error);
  return (text.split(/\s*params:/)[0] ?? "")
    .replace(/https?:\/\/[^\s"'<>]+/g, (url) => {
      try {
        return `${new URL(url).origin}/…`;
      } catch {
        return "[url]";
      }
    })
    .slice(0, MAX_ERROR_LENGTH);
}

/**
 * Apunta cómo acabó una vuelta de un trabajo programado (ADR 075). Un fallo a
 * medias (`degraded`) cuenta como fallo: es lo que vigila la alerta de «falla
 * seguido». Si la base falla al apuntarlo, se registra y se sigue: el trabajo
 * ya corrió, y su resultado no depende de esto.
 */
export async function recordJobRun(
  job: string,
  run: {
    startedAt: Date;
    finishedAt: Date;
    status: JobRunStatus;
    error?: unknown;
  },
) {
  const failed = run.status !== "ok";
  const lastError = run.error === undefined ? null : errorText(run.error);
  const durationMs = Math.max(
    0,
    run.finishedAt.getTime() - run.startedAt.getTime(),
  );

  try {
    await db
      .insert(jobStatusTable)
      .values({
        job,
        lastStartedAt: run.startedAt,
        lastFinishedAt: run.finishedAt,
        lastStatus: run.status,
        lastDurationMs: durationMs,
        lastSuccessAt: failed ? null : run.finishedAt,
        consecutiveFailures: failed ? 1 : 0,
        lastError,
      })
      .onConflictDoUpdate({
        target: jobStatusTable.job,
        set: {
          lastStartedAt: run.startedAt,
          lastFinishedAt: run.finishedAt,
          lastStatus: run.status,
          lastDurationMs: durationMs,
          lastSuccessAt: failed
            ? sql`${jobStatusTable.lastSuccessAt}`
            : run.finishedAt,
          consecutiveFailures: failed
            ? sql`${jobStatusTable.consecutiveFailures} + 1`
            : 0,
          lastError,
        },
      });
  } catch (error) {
    log.warn("Could not record the scheduled job run", error, { job });
  }
}
