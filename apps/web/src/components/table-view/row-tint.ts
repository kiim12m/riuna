import type Task from "@/types/task";

export const ROW_COLORINGS = ["priority", "due"] as const;
export type RowColoring = (typeof ROW_COLORINGS)[number];

export type RowTint = "danger" | "warning" | null;

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date: Date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

/**
 * El tono de una fila de la Tabla (ADR 080). Por prioridad: urgente en
 * peligro, alta en aviso. Por vencimiento: vencida en peligro y lo que vence
 * en los proximos siete dias en aviso; lo hecho no se colorea, porque ya no
 * hay nada que vigilar.
 */
export function rowTint(
  task: Pick<Task, "priority" | "dueDate" | "completedAt">,
  coloring: RowColoring | undefined,
  now = new Date(),
): RowTint {
  if (coloring === "priority") {
    if (task.priority === "urgent") return "danger";
    if (task.priority === "high") return "warning";
    return null;
  }

  if (coloring === "due") {
    if (task.completedAt || !task.dueDate) return null;
    const due = new Date(task.dueDate).getTime();
    if (Number.isNaN(due)) return null;
    const today = startOfDay(now).getTime();
    if (due < today) return "danger";
    if (due < today + 7 * DAY_MS) return "warning";
  }

  return null;
}

export const ROW_TINT_CLASS: Record<Exclude<RowTint, null>, string> = {
  danger: "bg-destructive/8",
  warning: "bg-warning/10",
};
