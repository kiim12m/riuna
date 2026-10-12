type Translate = (key: string, options?: Record<string, unknown>) => string;

/**
 * Los textos del estado de la instancia (ADR 075), para la página y para la
 * campana. La API manda cada problema como `kind` y `params`, y además en
 * español y ya montado: ese texto es el `defaultValue` si llega un tipo que
 * esta web todavía no conoce.
 */

// Los trabajos se llaman por su id en la API; aquí, por su nombre. Un trabajo
// nuevo sin traducción sale con su id, que también se entiende.
export const JOB_NAME_KEYS = {
  "due-date-reminders": "settings:instance.jobs.names.dueDateReminders",
  "project-webhook-reminders":
    "settings:instance.jobs.names.projectWebhookReminders",
  "seat-reconciliation": "settings:instance.jobs.names.seatReconciliation",
  "trial-reminders": "settings:instance.jobs.names.trialReminders",
  "recurring-tasks": "settings:instance.jobs.names.recurringTasks",
  automations: "settings:instance.jobs.names.automations",
  "instance-health": "settings:instance.jobs.names.instanceHealth",
} as const;

const PROBLEM_KEYS = {
  backupMissing: "settings:instance.problems.backupMissing",
  backupStale: "settings:instance.problems.backupStale",
  backupUnreadable: "settings:instance.problems.backupUnreadable",
  offsiteNever: "settings:instance.problems.offsiteNever",
  offsiteStale: "settings:instance.problems.offsiteStale",
  jobFailing: "settings:instance.problems.jobFailing",
} as const;

const AREA_KEYS = {
  backups: "settings:instance.problems.areas.backups",
  offsite: "settings:instance.problems.areas.offsite",
  job: "settings:instance.problems.areas.job",
} as const;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function jobName(job: string, t: Translate) {
  const key = JOB_NAME_KEYS[job as keyof typeof JOB_NAME_KEYS];
  return key ? t(key) : job;
}

/** El texto de un problema, traducido. */
export function instanceProblemText(
  problem: { kind?: unknown; params?: unknown },
  fallback: string,
  t: Translate,
) {
  const key = PROBLEM_KEYS[problem.kind as keyof typeof PROBLEM_KEYS];
  if (!key) return fallback;
  const params = record(problem.params);
  const text = t(key, {
    ...params,
    job: typeof params.job === "string" ? jobName(params.job, t) : undefined,
    defaultValue: fallback,
  });
  const error = typeof params.error === "string" ? params.error : "";
  return error
    ? `${text} ${t("settings:instance.problems.lastError", { error })}`
    : text;
}

/** De qué es una alerta: «copias locales», «copia externa», «trabajo …». */
export function instanceAlertArea(
  eventData: Record<string, unknown>,
  t: Translate,
) {
  const key = AREA_KEYS[eventData.area as keyof typeof AREA_KEYS];
  if (!key) return null;
  const job =
    typeof eventData.job === "string" ? jobName(eventData.job, t) : "";
  return t(key, { job });
}
