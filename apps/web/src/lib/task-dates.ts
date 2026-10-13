import type Task from "@/types/task";

/**
 * Si las fechas de una tarea salen de otras y no se editan a mano (ADR 083):
 * un padre con fechas automaticas toma las de su rama.
 */
export function hasDerivedDates(
  task: Pick<Task, "autoDates" | "subtree">,
): boolean {
  return Boolean(task.autoDates) && (task.subtree?.childCount ?? 0) > 0;
}
