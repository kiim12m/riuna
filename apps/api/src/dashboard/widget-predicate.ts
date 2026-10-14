import { and, gte, lt, type SQL } from "drizzle-orm";
import { taskTable } from "../database/schema";
import { addDays, startOfServerDay } from "../utils/day-boundaries";
import { dueWindowCondition } from "../utils/due-window";
import {
  trendRange,
  type WidgetConfig,
  type WidgetDueWindow,
} from "./widget-config";

/**
 * Lo que distingue a un widget **dentro** de un barrido compartido.
 *
 * Es la contrapartida de `workspaceTaskConditions`, que da el ambito: lo que
 * sale de aqui no puede entrar alli. Si la ventana de vencimiento formara parte
 * del ambito, siete tarjetas con siete ventanas distintas dejarian de compartir
 * base y `collapse-counts.ts` no podria existir. Asi, la misma lista vale para
 * un `WHERE` (la ruta en serie, via `aggregate({ extra })`) y para un
 * `FILTER (WHERE ...)` (la ruta colapsada), que es lo que garantiza que las dos
 * devuelvan la misma cifra.
 *
 * `weekStart` es el principio de la semana natural de quien mira
 * (`startOfServerWeek`), que solo hace falta para `thisWeek`.
 *
 * **La ventana de `rangeDays` no esta aqui a proposito**: se aplica sobre
 * `task.completed_at` o sobre `time_entry.start_time` segun la metrica, y esa
 * eleccion la hace `aggregate()`, que es quien sabe sobre que relacion esta
 * consultando. Meterla aqui habria puesto `completed_at` en la tarjeta de horas.
 */
export function widgetPredicates(
  config: WidgetConfig,
  now: Date,
  weekStart: Date,
): SQL[] {
  return config.dueWindow
    ? [widgetDueWindowCondition(config.dueWindow, now, weekStart)]
    : [];
}

function widgetDueWindowCondition(
  window: WidgetDueWindow,
  now: Date,
  weekStart: Date,
): SQL {
  if (window !== "thisWeek") return dueWindowCondition(window, now);

  // De mañana, como la `week` compartida —hoy ya lo cuenta "Vencen hoy"—, al
  // final de la semana natural. El ultimo dia de la semana el rango queda
  // vacio y la tarjeta da 0, que es la respuesta correcta.
  return and(
    gte(taskTable.dueDate, addDays(startOfServerDay(now), 1)),
    lt(taskTable.dueDate, addDays(weekStart, 7)),
  ) as SQL;
}

/**
 * La ventana de cierre de `rangeDays`, sobre `task.completed_at`.
 *
 * Solo la usa la ruta colapsada, que por construccion consulta `task`: en la
 * ruta en serie el equivalente lo aplica `aggregate()` con su `from`/`to`. Sale
 * del mismo `trendRange` para que "los ultimos siete dias" no pueda significar
 * dos cosas segun por donde se calcule la tarjeta.
 */
export function completionRangePredicates(
  config: WidgetConfig,
  now: Date,
): SQL[] {
  if (config.rangeDays === undefined) return [];

  const { from, to } = trendRange(config, now);
  return [
    gte(taskTable.completedAt, from) as SQL,
    lt(taskTable.completedAt, to) as SQL,
  ];
}
