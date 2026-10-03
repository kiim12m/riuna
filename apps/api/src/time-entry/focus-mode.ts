/** Los modos de foco (ADR 056), los mismos que admite el CHECK de la base. */
export const FOCUS_MODES = ["pomodoro", "flowtime", "countdown"] as const;

export type FocusMode = (typeof FOCUS_MODES)[number];
