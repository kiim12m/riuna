import type { BackupState } from "./backups";

/**
 * Lo que está mal en la instancia ahora mismo (ADR 075). Es puro: lo usan la
 * página de estado, para enseñarlo, y el trabajo de alertas, para abrir y
 * cerrar avisos. Una clave por condición; mientras la condición siga, la clave
 * es la misma y el aviso no se repite.
 *
 * Cada problema va dos veces:
 * - `kind` y `params`, para que la página y la campana lo traduzcan;
 * - `message`, en español y ya montado, para ntfy, Gotify, correo o webhook,
 *   que no pasan por las traducciones de la web.
 */

export const HEALTH_PROBLEM_KINDS = [
  "backupMissing",
  "backupStale",
  "backupUnreadable",
  "offsiteNever",
  "offsiteStale",
  "jobFailing",
] as const;

export type HealthProblem = {
  key: string;
  kind: (typeof HEALTH_PROBLEM_KINDS)[number];
  params: Record<string, string | number>;
  message: string;
};

/**
 * De qué es una alerta, sacado de su clave. Lo necesita el aviso de
 * «resuelto», que solo tiene la clave de la alerta que cierra.
 */
export function alertArea(key: string): {
  area: "backups" | "offsite" | "job";
  job?: string;
} {
  if (key.startsWith("job.failing:")) {
    return { area: "job", job: key.slice("job.failing:".length) };
  }
  if (key.startsWith("offsite.")) return { area: "offsite" };
  return { area: "backups" };
}

/** El nombre del área en español, para el título de los canales externos. */
export function alertAreaLabel(key: string) {
  const { area, job } = alertArea(key);
  if (area === "job") return `trabajo «${job}»`;
  return area === "offsite" ? "copia externa" : "copias locales";
}

// El último error va aparte en `params`: la web lo añade con su propia frase.
function withError(error: string | null | undefined): Record<string, string> {
  return error ? { error } : {};
}

export type JobState = {
  job: string;
  lastStatus: string;
  consecutiveFailures: number;
  lastError: string | null;
};

const HOUR = 60 * 60 * 1000;

// Tres seguidos: uno suelto es ruido (una red que parpadea); tres, cada cinco
// minutos, ya son un cuarto de hora sin funcionar.
export const JOB_FAILURE_THRESHOLD = 3;

function hours(env: string | undefined, fallback: number) {
  const value = Number(env);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function hoursAgo(iso: string, now: Date) {
  return Math.floor((now.getTime() - new Date(iso).getTime()) / HOUR);
}

/**
 * Las claves que ahora no se pueden comprobar. Su alerta abierta sigue abierta:
 * no saber si una copia es reciente no es saber que lo es.
 */
export function uncheckedKeys(backups: BackupState) {
  return backups.configured && !backups.readable
    ? ["backup.stale", "offsite.failing"]
    : [];
}

export function findProblems({
  backups,
  jobs,
  now = new Date(),
}: {
  backups: BackupState;
  jobs: JobState[];
  now?: Date;
}): HealthProblem[] {
  const problems: HealthProblem[] = [];

  if (backups.configured && !backups.readable) {
    problems.push({
      key: "backup.unreadable",
      kind: "backupUnreadable",
      params: {},
      message:
        "La API no puede leer el directorio de copias (BACKUP_DIR): no sabe si se están haciendo.",
    });
  } else if (backups.configured) {
    // Una copia por intervalo, con dos horas de margen para el volcado.
    const every = hours(process.env.BACKUP_INTERVAL_HOURS, 24);
    if (!backups.latest) {
      problems.push({
        key: "backup.stale",
        kind: "backupMissing",
        params: {},
        message: "No hay ninguna copia de la base en el directorio de copias.",
      });
    } else if (
      now.getTime() - new Date(backups.latest.createdAt).getTime() >
      (every + 2) * HOUR
    ) {
      const ago = hoursAgo(backups.latest.createdAt, now);
      problems.push({
        key: "backup.stale",
        kind: "backupStale",
        params: { hours: ago, every },
        message: `La última copia de la base es de hace ${ago} h, y se espera una cada ${every} h.`,
      });
    }
  }

  const offsite = backups.offsite;
  if (offsite) {
    // Dos subidas perdidas y una hora: una sola que falla no avisa.
    const every = hours(process.env.OFFSITE_INTERVAL_HOURS, 6);
    const detail = offsite.message ? ` Último error: ${offsite.message}` : "";
    if (!offsite.lastSuccessAt) {
      if (offsite.status === "error") {
        problems.push({
          key: "offsite.failing",
          kind: "offsiteNever",
          params: withError(offsite.message),
          message: `La copia externa no ha subido nunca.${detail}`,
        });
      }
    } else if (
      now.getTime() - new Date(offsite.lastSuccessAt).getTime() >
      (2 * every + 1) * HOUR
    ) {
      const ago = hoursAgo(offsite.lastSuccessAt, now);
      problems.push({
        key: "offsite.failing",
        kind: "offsiteStale",
        params: { hours: ago, ...withError(offsite.message) },
        message: `La copia externa no sube desde hace ${ago} h.${detail}`,
      });
    }
  }

  for (const job of jobs) {
    if (job.consecutiveFailures >= JOB_FAILURE_THRESHOLD) {
      const detail = job.lastError ? ` Último error: ${job.lastError}` : "";
      problems.push({
        key: `job.failing:${job.job}`,
        kind: "jobFailing",
        params: {
          job: job.job,
          failures: job.consecutiveFailures,
          ...withError(job.lastError),
        },
        message: `El trabajo programado «${job.job}» ha fallado ${job.consecutiveFailures} veces seguidas.${detail}`,
      });
    }
  }

  return problems;
}
