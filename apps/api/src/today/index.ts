import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import {
  planDeadlineSchema,
  planEntrySchema,
  planTaskSchema,
} from "../planner/schemas";
import { DUE_WINDOWS } from "../utils/due-window";
import { requireApiKeyScope } from "../utils/require-workspace-permission";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import getToday from "./controllers/get-today";

/** Una tarea terminada hoy, con lo registrado -para la fila de "Hechas hoy"-. */
const doneTaskSchema = v.object({
  ...planTaskSchema.entries,
  loggedSeconds: v.number(),
});

/**
 * Una fila de "vence hoy o vencida": la clasificacion la manda el servidor
 * -siempre "overdue" u "today" aqui, por la propia condicion de la consulta-
 * en vez de que el cliente compare fechas como texto (ADR 047).
 */
const urgentTaskSchema = v.object({
  ...planDeadlineSchema.entries,
  dueWindow: v.picklist(DUE_WINDOWS),
});

const todayResponseSchema = v.object({
  /** Planificadas antes de hoy y todavia sin terminar -"De dias anteriores". */
  previous: v.array(planEntrySchema),
  /** El plan de hoy: sin terminar, con o sin hora. */
  planned: v.array(
    v.object({
      ...planEntrySchema.entries,
      /** El instante de la hora anclada, o `null` sin hora (ADR 055). */
      startsAt: v.nullable(v.date()),
    }),
  ),
  /**
   * Vencido o vence hoy, sin planificar hoy ni antes. Si esta planificada
   * para un dia futuro sale igual, con su `plannedDate` (ADR 046).
   */
  urgent: v.array(urgentTaskSchema),
  /** Terminadas hoy, y asignadas o planificadas para hoy. */
  done: v.array(doneTaskSchema),
  totals: v.object({
    /** Suma de lo que queda (`estimate - loggedSeconds`) de `planned`. */
    estimateRemaining: v.number(),
    /** Lo registrado hoy por quien mira, en cualquier tarea. */
    workedToday: v.number(),
    /** La jornada personal de hoy, menos la comida y los bloques cerrados. */
    capacitySeconds: v.number(),
    /** Sesiones del modo foco empezadas hoy (ADR 056). */
    focusSessions: v.number(),
  }),
  /** El dia del servidor, `yyyy-mm-dd`. */
  serverToday: v.string(),
  /** Si ya se paso por «Terminar el dia» (ADR 054). */
  dayClosed: v.boolean(),
});

/**
 * Hoy: la pantalla de entrada del espacio personal (ADR 046). Composicion
 * pura sobre `personal_plan_entry` y `my-work/decorate.ts` -sin tabla
 * propia-, igual que el Planificador.
 */
const today = new Hono<{
  Variables: {
    userId: string;
    workspaceId: string;
  };
}>().get(
  "/",
  describeRoute({
    operationId: "getToday",
    tags: ["Today"],
    description:
      "The current user's plan for today, plus what's overdue or due today and unplanned, and what was finished today",
    responses: {
      200: {
        description: "Today's plan",
        content: {
          "application/json": { schema: resolver(todayResponseSchema) },
        },
      },
    },
  }),
  validator(
    "query",
    v.object({ workspaceId: v.pipe(v.string(), v.minLength(1)) }),
  ),
  workspaceAccess.fromQuery(),
  requireApiKeyScope({ task: ["read"] }),
  async (c) => {
    const { workspaceId } = c.req.valid("query");
    const result = await getToday({ workspaceId, userId: c.get("userId") });
    return c.json(result);
  },
);

export default today;
