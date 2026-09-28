import { and, gte, isNull, lt, type SQL, sql } from "drizzle-orm";
import { taskTable } from "../database/schema";
import { addDays, startOfServerDay } from "./day-boundaries";

export type DueWindow = "overdue" | "today" | "week" | "later" | "none";

export const DUE_WINDOWS = [
  "overdue",
  "today",
  "week",
  "later",
  "none",
] as const;

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

/**
 * La misma clasificacion, pero como **predicado de rango** en vez de un `CASE`.
 *
 * Existe aparte de `dueWindowExpression` porque un `CASE` en el `WHERE` no es
 * sargable: filtrar por el obliga a evaluarlo fila a fila y `task_dueDate_idx`
 * no entra. Comparar la columna desnuda contra dos fronteras si lo aprovecha, y
 * eso es lo que separa una tarjeta de recuento que responde de una que barre la
 * tabla entera.
 *
 * Las dos tienen que decir **exactamente** lo mismo: para cualquier fecha, la
 * etiqueta que pone el `CASE` es la unica ventana cuya condicion es cierta. Eso
 * lo comprueba `tests/api-integration/dashboard.test.ts` con filas de verdad en
 * las fronteras, que es lo unico que lo demuestra; la prueba de unidad solo
 * puede comparar las fronteras enlazadas.
 *
 * Vivia privada en `my-work/controllers/get-my-work.ts`; el tercer consumidor
 * —las tarjetas del panel— es lo que la trae aqui, y al traerla se corrigio que
 * su `week` empezara hoy en vez de manana.
 */
export function dueWindowCondition(window: DueWindow, now: Date): SQL {
  const startOfToday = startOfServerDay(now);

  // Una fecha nula hace NULL la comparacion, no true, asi que las tareas sin
  // vencimiento quedan fuera de las cuatro ventanas con fecha sin pedirlo.
  switch (window) {
    case "none":
      return isNull(taskTable.dueDate) as SQL;
    case "overdue":
      return lt(taskTable.dueDate, startOfToday) as SQL;
    case "later":
      return gte(taskTable.dueDate, addDays(startOfToday, 7)) as SQL;
    case "today":
      return and(
        gte(taskTable.dueDate, startOfToday),
        lt(taskTable.dueDate, addDays(startOfToday, 1)),
      ) as SQL;
    // **`week` empieza manana, no hoy.** El `CASE` evalua sus ramas en orden y
    // la de `today` va antes, asi que una tarea de hoy nunca cae en el cubo
    // `week`. Cuando esto arrancaba en `startOfToday` —como hacia la version
    // privada de `my-work`— la tarjeta "Vencen esta semana" contaba las de hoy
    // otra vez y discrepaba del reparto por `dueWindow` de la pantalla de al
    // lado, que si usa el `CASE`. Quien quiera "los proximos siete dias"
    // compone las dos ventanas; ver `get-my-work.ts`.
    case "week":
      return and(
        gte(taskTable.dueDate, addDays(startOfToday, 1)),
        lt(taskTable.dueDate, addDays(startOfToday, 7)),
      ) as SQL;
  }
}
