import { type SQL, sql } from "drizzle-orm";
import { taskTable } from "../database/schema";
import { addDays, startOfServerDay } from "./day-boundaries";

export type DueWindow = "overdue" | "today" | "week" | "later" | "none";

/**
 * El `CASE` de las cinco ventanas de vencimiento, con las fronteras del
 * servidor (`startOfServerDay`/`addDays`). Comparte las fronteras con el
 * agrupado `dueWindow` de los paneles (`dashboard/aggregate.ts`) y con las
 * vistas personales (`my-work/controllers/search-tasks.ts`, el Planificador):
 * la misma tarea tiene que caer en la misma ventana la mire quien la mire.
 */
export function dueWindowExpression(now: Date): SQL<DueWindow> {
  const today = startOfServerDay(now);
  const tomorrow = addDays(today, 1);
  const nextWeek = addDays(today, 7);

  return sql<DueWindow>`CASE
    WHEN ${taskTable.dueDate} IS NULL THEN 'none'
    WHEN ${taskTable.dueDate} < ${today} THEN 'overdue'
    WHEN ${taskTable.dueDate} < ${tomorrow} THEN 'today'
    WHEN ${taskTable.dueDate} < ${nextWeek} THEN 'week'
    ELSE 'later'
  END`;
}
