export type DueWindow = "overdue" | "today" | "week" | "later" | "none";

export const DUE_WINDOW_ORDER: DueWindow[] = [
  "overdue",
  "today",
  "week",
  "later",
  "none",
];

/**
 * Reparte una lista de tareas en sus cinco cubos, en el orden de siempre.
 *
 * No calcula la ventana: la API ya la resuelve con `dueWindowExpression`
 * (`apps/api/src/utils/due-window.ts`) y la manda como campo `dueWindow` en
 * cada tarea. Calcularla aqui tambien, con el reloj del navegador, es lo que
 * hacia que una tarea saliera vencida en una pantalla y no en la otra cuando
 * el navegador y el servidor no comparten zona horaria.
 */
export function groupByDueWindow<T>(
  items: T[],
  getDueWindow: (item: T) => DueWindow,
): Record<DueWindow, T[]> {
  const groups: Record<DueWindow, T[]> = {
    overdue: [],
    today: [],
    week: [],
    later: [],
    none: [],
  };
  for (const item of items) {
    groups[getDueWindow(item)].push(item);
  }
  return groups;
}
