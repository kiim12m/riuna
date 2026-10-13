import type Task from "@/types/task";

type DatesSource = Pick<
  Task,
  "autoDates" | "subtree" | "hasPredecessors" | "isMilestone"
>;

const isSummary = (task: DatesSource) => (task.subtree?.childCount ?? 0) > 0;

/**
 * Si las fechas de una tarea salen de otras y no se editan a mano: un padre
 * con fechas automaticas toma las de su rama (ADR 083).
 */
export function hasDerivedDates(task: DatesSource): boolean {
  return Boolean(task.autoDates) && isSummary(task);
}

/**
 * Si el inicio no se elige a mano: el de un resumen automatico, o el de una
 * sucesora atada a sus predecesoras (ADR 084).
 */
export function hasDerivedStart(task: DatesSource): boolean {
  return (
    hasDerivedDates(task) ||
    (Boolean(task.autoDates) && Boolean(task.hasPredecessors))
  );
}

/**
 * Si el fin tampoco: el de un resumen automatico, o el de un hito atado, que
 * solo tiene un dia. El de una sucesora si se mueve: es su duracion.
 */
export function hasDerivedDue(task: DatesSource): boolean {
  return (
    hasDerivedDates(task) ||
    (Boolean(task.autoDates) &&
      Boolean(task.hasPredecessors) &&
      Boolean(task.isMilestone))
  );
}

/** Si tiene de donde sacar fechas automaticas: hijas o predecesoras. */
export function canHaveAutoDates(task: DatesSource): boolean {
  return isSummary(task) || Boolean(task.hasPredecessors);
}
