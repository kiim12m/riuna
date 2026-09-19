import { HTTPException } from "hono/http-exception";
import * as v from "valibot";
import { editableFilterSchema } from "../view/filter-schema";
import {
  type AggregateRequest,
  CATEGORICAL_GROUP_BY,
  GRANULARITIES,
  MAX_TIME_BUCKETS,
  WIDGET_METRICS,
} from "./aggregate";

export const WIDGET_TYPES = [
  "count",
  "breakdown",
  "trend",
  "time",
  "epic_progress",
  "table",
  "inbox",
  "goal",
] as const;

export type WidgetType = (typeof WIDGET_TYPES)[number];

/** Cuantos widgets caben en un panel. Un tope, no una invariante de la base. */
export const MAX_WIDGETS_PER_DASHBOARD = 12;

/** Cuantas filas devuelve la tabla embebida. No pagina: no es una vista. */
export const TABLE_WIDGET_ROWS = 20;

/**
 * El `config` de un widget.
 *
 * El filtro se guarda **en forma editable**, exactamente igual que
 * `view.config`, y con el mismo esquema. Es lo que hace que una vista guardada
 * pueda alimentar un widget mas adelante sin ninguna conversion: la forma es la
 * misma por construccion y no por convenio.
 */
export const widgetConfigSchema = v.object({
  filter: v.optional(editableFilterSchema),
  /**
   * Acota el widget al trabajo de quien mira: lo asignado a esa persona, o lo
   * de sus equipos. Es lo que "Mi trabajo" era como pagina, ahora disponible
   * para cualquier widget, y se apoya en los mismos predicados medidos.
   */
  scope: v.optional(v.picklist(["assigned", "team"])),
  metric: v.optional(v.picklist(WIDGET_METRICS)),
  groupBy: v.optional(v.picklist([...CATEGORICAL_GROUP_BY, "time"])),
  granularity: v.optional(v.picklist(GRANULARITIES)),
  /** Ventana de la tendencia, hacia atras desde hoy. */
  rangeDays: v.optional(v.pipe(v.number(), v.minValue(1), v.maxValue(1095))),
});

export type WidgetConfig = v.InferOutput<typeof widgetConfigSchema>;

type ResolvedWidget = Pick<
  AggregateRequest,
  "metric" | "groupBy" | "granularity"
>;

/**
 * Que consulta corresponde a cada tipo, y que combinaciones no existen.
 *
 * Se valida al **escribir** y no solo al leer, por el mismo motivo que el
 * `config` de una vista: guardar un widget que el agregado rechazara despues
 * deja el panel roto con el fallo descubierto en el consumidor y no en el
 * productor.
 */
export function resolveWidget(
  type: WidgetType,
  config: WidgetConfig,
  projectId: string | null,
): ResolvedWidget {
  const granularity = config.granularity ?? "week";

  switch (type) {
    case "count":
      return { metric: config.metric ?? "count", groupBy: undefined };

    case "breakdown": {
      const groupBy = config.groupBy;

      if (!groupBy || groupBy === "time" || groupBy === "epic") {
        throw new HTTPException(400, {
          message: "A breakdown widget needs a categorical groupBy",
        });
      }

      // `status` compara contra los slugs de las columnas de **un** proyecto,
      // asi que entre proyectos no significa nada. Su sustituto es `done`.
      if (groupBy === "status" && !projectId) {
        throw new HTTPException(400, {
          message:
            "Grouping by status needs a project; use `done` across projects",
        });
      }

      return { metric: config.metric ?? "count", groupBy, granularity };
    }

    case "trend":
      return { metric: "count", groupBy: "time", granularity };

    case "time": {
      const groupBy = config.groupBy;

      if (groupBy && !["assignee", "project", "time"].includes(groupBy)) {
        throw new HTTPException(400, {
          message: "Logged time groups by assignee, project or time",
        });
      }

      return {
        metric: "sumLogged",
        groupBy: groupBy ?? "assignee",
        granularity,
      };
    }

    case "epic_progress":
      if (!projectId) {
        throw new HTTPException(400, {
          message: "Epic progress needs a project: epics belong to one",
        });
      }

      return { metric: "doneRatio", groupBy: "epic" };

    case "table":
    // Un widget de objetivo tampoco pasa por el agregado de tareas: lee el
    // progreso que ya calcula el modulo de objetivos, que es la misma cifra que
    // se ve en su pantalla. Duplicar el calculo aqui era pedir que divergieran.
    case "goal":
    // La bandeja no pasa por el agregado: la pinta el cliente con la misma
    // consulta `["notifications"]` que alimenta la campana, asi que marcar
    // leido actualiza las dos a la vez. Es lo que decidio la ADR 024 y sigue
    // valiendo: no estrena modelo.
    case "inbox":
      return { metric: "count", groupBy: undefined };
  }
}

/** La ventana de una tendencia, acotada para que la grafica se pueda leer. */
export function trendRange(
  config: WidgetConfig,
  now: Date,
): { from: Date; to: Date } {
  const granularity = config.granularity ?? "week";
  const daysPerBucket =
    granularity === "day" ? 1 : granularity === "week" ? 7 : 30;

  const requested = config.rangeDays ?? daysPerBucket * 12;
  const capped = Math.min(requested, MAX_TIME_BUCKETS * daysPerBucket);

  const to = new Date(now);
  const from = new Date(now);
  from.setDate(from.getDate() - capped);

  return { from, to };
}
