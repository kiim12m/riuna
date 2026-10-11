import type { BackupState } from "./backups";

/**
 * Lo que está mal en la instancia ahora mismo (ADR 075). Es puro: lo usan la
 * página de estado, para enseñarlo, y el trabajo de alertas, para abrir y
 * cerrar avisos. Una clave por condición; mientras la condición siga, la clave
 * es la misma y el aviso no se repite.
 *
 * Los textos van en español y ya montados: llegan tal cual por ntfy, Gotify,
 * correo o webhook, que no pasan por las traducciones de la web.
 */

export type HealthProblem = { key: string; label: string; message: string };

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

  if (backups.configured) {
    // Una copia por intervalo, con dos horas de margen para el volcado.
    const every = hours(process.env.BACKUP_INTERVAL_HOURS, 24);
    if (!backups.latest) {
      problems.push({
        key: "backup.stale",
        label: "copias locales",
        message: "No hay ninguna copia de la base en el directorio de copias.",
      });
    } else if (
      now.getTime() - new Date(backups.latest.createdAt).getTime() >
      (every + 2) * HOUR
    ) {
      problems.push({
        key: "backup.stale",
        label: "copias locales",
        message: `La última copia de la base es de hace ${hoursAgo(backups.latest.createdAt, now)} h, y se espera una cada ${every} h.`,
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
          label: "copia externa",
          message: `La copia externa no ha subido nunca.${detail}`,
        });
      }
    } else if (
      now.getTime() - new Date(offsite.lastSuccessAt).getTime() >
      (2 * every + 1) * HOUR
    ) {
      problems.push({
        key: "offsite.failing",
        label: "copia externa",
        message: `La copia externa no sube desde hace ${hoursAgo(offsite.lastSuccessAt, now)} h.${detail}`,
      });
    }
  }

  for (const job of jobs) {
    if (job.consecutiveFailures >= JOB_FAILURE_THRESHOLD) {
      const detail = job.lastError ? ` Último error: ${job.lastError}` : "";
      problems.push({
        key: `job.failing:${job.job}`,
        label: `trabajo «${job.job}»`,
        message: `El trabajo programado «${job.job}» ha fallado ${job.consecutiveFailures} veces seguidas.${detail}`,
      });
    }
  }

  return problems;
}
