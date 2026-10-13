/** El estado de salud de un proyecto (ADR 087). */
export const PROJECT_HEALTHS = [
  "not_started",
  "on_track",
  "at_risk",
  "off_track",
  "finished",
  "cancelled",
] as const;
export type ProjectHealth = (typeof PROJECT_HEALTHS)[number];

export function isProjectHealth(value: unknown): value is ProjectHealth {
  return PROJECT_HEALTHS.includes(value as ProjectHealth);
}

/** El punto de color de cada estado, con los tonos semanticos del tema. */
export const HEALTH_DOT: Record<ProjectHealth, string> = {
  not_started: "bg-muted-foreground/45",
  on_track: "bg-success",
  at_risk: "bg-warning",
  off_track: "bg-destructive",
  finished: "bg-info",
  cancelled: "bg-muted-foreground/25",
};

/** Lo que pide atencion: «En riesgo o desviados». */
export function needsAttention(health: string | null | undefined) {
  return health === "at_risk" || health === "off_track";
}
