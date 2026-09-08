import * as v from "valibot";
import { WIDGET_METRICS } from "../dashboard/aggregate";
import { editableFilterSchema } from "../view/filter-schema";

/** Cuantos resultados clave caben en un objetivo. Un tope, no una invariante. */
export const MAX_TARGETS_PER_GOAL = 8;

/**
 * El `config` de un resultado clave.
 *
 * Es el de un widget **menos la agrupacion**: un resultado clave es un numero,
 * no un reparto. Compartir la forma no es cosmetico, es lo que deja que el
 * progreso lo calcule `aggregate()` sin una segunda capa de agregacion.
 *
 * `sumLogged` queda fuera a proposito: mide sobre `time_entry.start_time` y no
 * sobre el cierre de la tarea, asi que el periodo del objetivo significaria otra
 * cosa que en el resto de metricas. Cuando haga falta, entra con su propia
 * ventana y dicho en la ADR, no de tapadillo.
 */
export const GOAL_METRICS = WIDGET_METRICS.filter(
  (metric) => metric !== "sumLogged",
);

export const targetConfigSchema = v.object({
  filter: v.optional(editableFilterSchema),
  scope: v.optional(v.picklist(["assigned", "team"])),
  metric: v.optional(v.picklist(GOAL_METRICS as [string, ...string[]])),
});

export type TargetConfig = v.InferOutput<typeof targetConfigSchema>;
