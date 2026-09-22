export type DueWindow = "overdue" | "today" | "week" | "later" | "none";

export const DUE_WINDOW_ORDER: DueWindow[] = [
  "overdue",
  "today",
  "week",
  "later",
  "none",
];

function startOfDay(date: Date): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

function addDays(date: Date, days: number): Date {
  const shifted = new Date(date);
  shifted.setDate(shifted.getDate() + days);
  return shifted;
}

/**
 * Mismas fronteras que `dueWindowExpression` en `apps/api/src/dashboard/aggregate.ts`:
 * el mismo campo tiene que caer en la misma ventana lo pinte el panel o "Hoy",
 * o una tarea saldria vencida en una pantalla y no en la otra.
 */
export function getDueWindow(
  dueDate: string | Date | null,
  now: Date = new Date(),
): DueWindow {
  if (!dueDate) return "none";

  const due = typeof dueDate === "string" ? new Date(dueDate) : dueDate;
  const today = startOfDay(now);
  const tomorrow = addDays(today, 1);
  const nextWeek = addDays(today, 7);

  if (due < today) return "overdue";
  if (due < tomorrow) return "today";
  if (due < nextWeek) return "week";
  return "later";
}

/** Reparte una lista de tareas en sus cinco cubos, en el orden de siempre. */
export function groupByDueWindow<T>(
  items: T[],
  getDueDate: (item: T) => string | Date | null,
  now: Date = new Date(),
): Record<DueWindow, T[]> {
  const groups: Record<DueWindow, T[]> = {
    overdue: [],
    today: [],
    week: [],
    later: [],
    none: [],
  };
  for (const item of items) {
    groups[getDueWindow(getDueDate(item), now)].push(item);
  }
  return groups;
}
