import { HTTPException } from "hono/http-exception";
import * as v from "valibot";
import { DUE_WINDOWS } from "../utils/due-window";
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
  "week",
] as const;

export type WidgetType = (typeof WIDGET_TYPES)[number];

/**
 * Cuantos widgets caben en un panel. Un tope, no una invariante de la base.
 *
 * Subio de 12 a 24 con la rejilla de doce columnas (ADR 043): la distribucion
 * de partida sola son once, asi que el tope viejo dejaba un panel recien
 * sembrado a un widget del 422.
 */
export const MAX_WIDGETS_PER_DASHBOARD = 24;

/** Cuantas filas devuelve la tabla embebida. No pagina: no es una vista. */
export const TABLE_WIDGET_ROWS = 20;

/** Cuantas tareas ensena cada dia de la tira semanal antes del "+N mas". */
export const WEEK_WIDGET_TASKS_PER_DAY = 4;

/**
 * El tamano con el que nace cada tipo, en celdas de la rejilla de doce.
 *
 * Vive aqui y no en el `default()` de la columna porque el defecto de la base
 * es 1x1 para todos, y una tabla de veinte filas de una fila de alto no es un
 * widget: es un recorte. Lo leen `create-widget.ts`, `default-layout.ts` y el
 * `CASE` de la migracion 0066, que son los tres sitios donde un tamano aparece
 * sin que nadie lo haya elegido.
 */
export const DEFAULT_WIDGET_SIZE: Record<
  WidgetType,
  { span: number; rowSpan: number }
> = {
  count: { span: 3, rowSpan: 1 },
  breakdown: { span: 4, rowSpan: 2 },
  trend: { span: 6, rowSpan: 2 },
  time: { span: 4, rowSpan: 2 },
  epic_progress: { span: 4, rowSpan: 2 },
  table: { span: 8, rowSpan: 4 },
  inbox: { span: 4, rowSpan: 4 },
  goal: { span: 4, rowSpan: 2 },
  week: { span: 12, rowSpan: 2 },
};

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
  groupBy: v.optional(v.picklist([...CATEGORICAL_GROUP_BY, "time", "none"])),
  /**
   * Acota el widget a una ventana de vencimiento, recalculada en cada lectura.
   *
   * Es una clave propia y no una condicion del filtro porque "hoy" es relativo:
   * un filtro guardado lleva fechas absolutas y al dia siguiente estaria
   * mintiendo. Se compila con `dueWindowCondition`, el predicado sargable, y
   * **no** entra en el ambito base de la lectura: es lo que distingue a cada
   * tarjeta dentro del barrido que comparten (`collapse-counts.ts`).
   */
  dueWindow: v.optional(v.picklist(DUE_WINDOWS)),
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

  // El agregado de tiempo registrado solo sabe agrupar por persona, proyecto o
  // fecha, y su grano es la entrada y no la tarea. En un recuento o un reparto
  // devolvia cifras de otra cosa bajo etiquetas que no eran suyas; tiene su
  // propio tipo de widget.
  if (
    (type === "count" || type === "breakdown") &&
    config.metric === "sumLogged"
  ) {
    throw new HTTPException(400, {
      message: "Logged time has its own widget type: use `time`",
    });
  }

  switch (type) {
    case "count":
      return { metric: config.metric ?? "count", groupBy: undefined };

    case "breakdown": {
      const groupBy = config.groupBy;

      if (
        !groupBy ||
        groupBy === "time" ||
        groupBy === "epic" ||
        groupBy === "none"
      ) {
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

      if (
        groupBy &&
        !["assignee", "project", "time", "none"].includes(groupBy)
      ) {
        throw new HTTPException(400, {
          message: "Logged time groups by assignee, project, time or none",
        });
      }

      // `none` es el total sin repartir: una sola cifra de horas, que es lo que
      // pide una tarjeta de la fila de arriba. No se expresa como un `count`
      // con metrica `sumLogged` porque esa combinacion sigue prohibida por la
      // razon de siempre —el grano de `time_entry` es la entrada, no la tarea—
      // y la migracion 0060 ya limpio las filas que la usaban.
      return {
        metric: "sumLogged",
        groupBy: groupBy === "none" ? undefined : (groupBy ?? "assignee"),
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
    // La tira semanal tampoco pasa por el agregado: su lectura es una lista de
    // tareas por dia, no cubos, y la sirve `week-tasks.ts`.
    case "week":
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
