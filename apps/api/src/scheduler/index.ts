import * as Sentry from "@sentry/node";
import { Cron } from "croner";
import { checkAutomations } from "../automation/scheduled";
import { checkInstanceHealth } from "../instance/alerts";
import { type JobRunStatus, recordJobRun } from "../instance/job-status";
import { generateRecurringTasks } from "../recurrence/generate";
import { sendDueTaskReminders } from "../task-reminder/send-due";
import { log } from "../utils/log";
import { checkDueDateReminders } from "./due-date-reminders";
import { HELD_ELSEWHERE, withJobLease } from "./leader-lock";
import { checkProjectWebhookReminders } from "./project-webhook-reminders";

const jobs: Cron[] = [];

// `skipped`: otra instancia tiene el arrendamiento y la vuelta no corrio
// aqui. No es una vuelta buena: apuntarla como `ok` ponia a cero los fallos
// seguidos de la instancia que si corre, y «falla seguido» no saltaba nunca
// con dos replicas (revision de la Fase 9).
type JobOutcome = { degraded?: boolean; skipped?: boolean };

// Cron jobs swallow their operational failures (per-item try/catch) so they
// can keep processing the rest of the batch. Reporting Sentry status purely
// from the thrown-rejection channel would always show "ok" for any partially
// failed run. Inspect the returned outcome instead so handled failures light
// up the monitor without aborting the rest of the work. Unexpected throws are
// captured as exception events and swallowed so one bad tick can't take down
// the scheduler via an unhandled rejection.
//
// Each run also leaves a log line (ADR 073): debug when it went well — every
// five minutes that would be noise — and warn or error when it did not. And
// its outcome goes to `job_status`, which the instance status page shows and
// the "keeps failing" alert watches (ADR 075).
export function withCheckIn<T>(name: string, fn: () => Promise<T>) {
  return async (): Promise<void> => {
    const checkInId = Sentry.captureCheckIn({
      monitorSlug: name,
      status: "in_progress",
    });
    const startedAt = new Date();
    const started = performance.now();
    const elapsed = () => Math.round(performance.now() - started);
    const record = (status: JobRunStatus, error?: unknown) =>
      recordJobRun(name, { startedAt, finishedAt: new Date(), status, error });
    try {
      const result = await fn();
      if ((result as JobOutcome | null | undefined)?.skipped) {
        Sentry.captureCheckIn({ checkInId, monitorSlug: name, status: "ok" });
        log.debug("Scheduled job held by another instance", { job: name });
        return;
      }
      const degraded = Boolean(
        (result as JobOutcome | null | undefined)?.degraded,
      );
      Sentry.captureCheckIn({
        checkInId,
        monitorSlug: name,
        status: degraded ? "error" : "ok",
      });
      if (degraded) {
        log.warn("Scheduled job degraded", {
          job: name,
          durationMs: elapsed(),
        });
      } else {
        log.debug("Scheduled job finished", {
          job: name,
          durationMs: elapsed(),
        });
      }
      await record(degraded ? "degraded" : "ok");
    } catch (error) {
      Sentry.captureException(error, { tags: { area: "cron", job: name } });
      Sentry.captureCheckIn({
        checkInId,
        monitorSlug: name,
        status: "error",
      });
      log.error("Scheduled job failed", error, {
        job: name,
        durationMs: elapsed(),
      });
      await record("error", error);
    }
  };
}

/** Arranca los trabajos programados y devuelve cuántos. */
export function initializeScheduler(): number {
  // Una instancia restaurada para un simulacro (ADR 072) trae las reglas, los
  // stand-ups programados y los recordatorios de la de verdad: con el
  // planificador en marcha, una copia mandaria mensajes reales a chats reales.
  if (process.env.RIUNA_DISABLE_SCHEDULER === "true") {
    log.warn("⏸️ Scheduler disabled (RIUNA_DISABLE_SCHEDULER=true)");
    return 0;
  }

  jobs.push(
    new Cron(
      "*/5 * * * *",
      withCheckIn("due-date-reminders", checkDueDateReminders),
    ),
  );
  jobs.push(
    new Cron(
      "*/5 * * * *",
      withCheckIn("project-webhook-reminders", checkProjectWebhookReminders),
    ),
  );
  // Cada minuto: quien pide «mañana a las 9:00» espera el aviso a las 9:00 y
  // no a las 9:04. Sin arrendamiento, porque cada recordatorio se reclama
  // borrandolo con `SKIP LOCKED` (ADR 077).
  jobs.push(
    new Cron("* * * * *", withCheckIn("task-reminders", sendDueTaskReminders)),
  );
  // Cada cinco minutos, pero **con arrendamiento**: al reves que los
  // recordatorios, que son idempotentes gracias a su tabla de "ya enviado",
  // generar una tarea no lo es. Con varias instancias, dos vueltas a la vez
  // crearian dos tareas para la misma ocurrencia.
  jobs.push(
    new Cron(
      "*/5 * * * *",
      withCheckIn("recurring-tasks", () =>
        withJobLease(
          "recurring-tasks",
          generateRecurringTasks,
          () => HELD_ELSEWHERE,
        ),
      ),
    ),
  );
  // Las automatizaciones por fecha y el envio del stand-up (ADR 067 y 068).
  // Con arrendamiento: enviar un stand-up o un webhook no es idempotente.
  jobs.push(
    new Cron(
      "*/5 * * * *",
      withCheckIn("automations", () =>
        withJobLease(
          "automations",
          () => checkAutomations(),
          () => HELD_ELSEWHERE,
        ),
      ),
    ),
  );
  // La salud de la instancia (ADR 075): copias, copia externa y trabajos que
  // fallan seguido. Con arrendamiento para que dos instancias no avisen dos
  // veces de lo mismo.
  jobs.push(
    new Cron(
      "*/15 * * * *",
      withCheckIn("instance-health", () =>
        withJobLease("instance-health", checkInstanceHealth, () => ({
          ...HELD_ELSEWHERE,
          opened: 0,
          resolved: 0,
        })),
      ),
    ),
  );
  log.info(
    "⏰ Scheduler started (reminders every 5 minutes, seat reconciliation and trial reminders hourly)",
  );
  return jobs.length;
}

export function shutdownScheduler(): void {
  for (const job of jobs) {
    job.stop();
  }
  jobs.length = 0;
}
