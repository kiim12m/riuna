import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import {
  addDays,
  endOfServerDay,
  parseServerDay,
  startOfServerDay,
} from "../utils/day-boundaries";
import { requireApiKeyScope } from "../utils/require-workspace-permission";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import getPlan from "./controllers/get-plan";
import getPlanEntry from "./controllers/get-plan-entry";
import removePlanEntry from "./controllers/remove-plan-entry";
import setPlanEntry from "./controllers/set-plan-entry";
import setPlanOrder from "./controllers/set-plan-order";
import { planDeadlineSchema, planEntrySchema, planTaskSchema } from "./schemas";

const MAX_WINDOW_DAYS = 60;
const DEFAULT_WINDOW_DAYS = 15;

/** CHECK `personal_plan_entry_start_minute_valid` (`schema.ts`): 0-1439. */
const startMinuteSchema = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(0),
  v.maxValue(1439),
);

const planGhostSchema = v.object({
  recurrenceId: v.string(),
  title: v.string(),
  estimate: v.nullable(v.number()),
  plannedDate: v.date(),
});

const fixedBlockSchema = v.object({
  id: v.string(),
  title: v.string(),
  startMinute: v.number(),
  endMinute: v.number(),
});

const planResponseSchema = v.object({
  entries: v.array(planEntrySchema),
  /**
   * Planificadas antes de la ventana y todavia sin terminar -"De dias
   * anteriores" de super-productivity-. Nunca se mueven solas: hace falta
   * "Añadir a hoy" para eso.
   */
  previous: v.array(planEntrySchema),
  unplanned: v.array(planTaskSchema),
  /**
   * Lo que vence dentro de la ventana, planificado o no -el vencimiento es
   * un dato aparte del plan, ADR 040-.
   */
  deadlines: v.array(planDeadlineSchema),
  ghosts: v.array(planGhostSchema),
  /**
   * La capacidad de cada dia de la ventana, por `yyyy-mm-dd` (ADR 045): 0 si
   * no es laborable, si no la jornada personal menos la comida y los
   * bloques cerrados de ese dia. Sustituye a la constante fija de 8 h de la
   * ADR 040.
   */
  capacityByDay: v.record(v.string(), v.number()),
  /** La carga de cada dia, con la misma `dayLoad` que el Cronograma (ADR 050). */
  loadByDay: v.record(
    v.string(),
    v.object({
      loadSeconds: v.number(),
      capacitySeconds: v.number(),
      pct: v.number(),
    }),
  ),
  /** Las citas fijas de cada dia, para "Con hora" y para sumar a la carga. */
  fixedBlocksByDay: v.record(v.string(), v.array(fixedBlockSchema)),
  /** El dia del servidor, `yyyy-mm-dd`: de ahi arranca la rejilla de 15 dias. */
  serverToday: v.string(),
});

/** Donde esta una tarea en el plan de quien mira, para su detalle. */
const planEntryLookupSchema = v.object({
  entry: v.nullable(
    v.object({
      plannedDay: v.string(),
      startMinute: v.nullable(v.number()),
    }),
  ),
});

/**
 * El plan personal de quien mira: que dia piensa hacer cada tarea, sin tocar
 * `due_date` (ADR 040). Vive en su propio modulo, plano como `my-work/`, y no
 * dentro de `task/`: las rutas de ahi son por proyecto y esta cruza todos.
 */
const planner = new Hono<{
  Variables: {
    userId: string;
    workspaceId: string;
  };
}>()
  .get(
    "/",
    describeRoute({
      operationId: "getPersonalPlan",
      tags: ["Planner"],
      description:
        "The current user's rolling plan: tasks placed on a day, tasks still unplanned, and the recurring occurrences that would be created inside the window",
      responses: {
        200: {
          description: "The plan for the requested window",
          content: {
            "application/json": { schema: resolver(planResponseSchema) },
          },
        },
      },
    }),
    validator(
      "query",
      v.object({
        workspaceId: v.pipe(v.string(), v.minLength(1)),
        days: v.optional(
          v.pipe(
            v.string(),
            v.transform(Number),
            v.number(),
            v.integer("Days must be an integer"),
            v.minValue(1, "Days must be at least 1"),
            v.maxValue(
              MAX_WINDOW_DAYS,
              `Days must not exceed ${MAX_WINDOW_DAYS}`,
            ),
          ),
          String(DEFAULT_WINDOW_DAYS),
        ),
      }),
    ),
    workspaceAccess.fromQuery(),
    requireApiKeyScope({ task: ["read"] }),
    async (c) => {
      const { workspaceId, days } = c.req.valid("query");

      const windowStart = startOfServerDay(new Date());
      const windowEnd = endOfServerDay(addDays(windowStart, days - 1));

      const plan = await getPlan({
        workspaceId,
        userId: c.get("userId"),
        windowStart,
        windowEnd,
      });

      return c.json(plan);
    },
  )
  .get(
    "/entry/:taskId",
    describeRoute({
      operationId: "getPersonalPlanEntry",
      tags: ["Planner"],
      description:
        "Where one task sits in the current user's plan, for the task detail: the planned day as yyyy-mm-dd in the server's time zone and the anchored minute, or null when it is unplanned",
      responses: {
        200: {
          description: "The plan entry, or null",
          content: {
            "application/json": { schema: resolver(planEntryLookupSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ taskId: v.string() })),
    validator(
      "query",
      v.object({ workspaceId: v.pipe(v.string(), v.minLength(1)) }),
    ),
    workspaceAccess.fromQuery(),
    requireApiKeyScope({ task: ["read"] }),
    async (c) => {
      const { taskId } = c.req.valid("param");
      const { workspaceId } = c.req.valid("query");

      return c.json(
        await getPlanEntry({ userId: c.get("userId"), workspaceId, taskId }),
      );
    },
  )
  .put(
    "/order",
    describeRoute({
      operationId: "setPersonalPlanOrder",
      tags: ["Planner"],
      description:
        "Rewrite the position of every entry planned on a day, in the order given. Ids that aren't the current user's, this day's or this workspace's are ignored rather than failing the whole call",
      responses: {
        200: {
          description: "Positions rewritten",
          content: {
            "application/json": {
              schema: resolver(v.object({ updated: v.number() })),
            },
          },
        },
      },
    }),
    validator(
      "query",
      v.object({ workspaceId: v.pipe(v.string(), v.minLength(1)) }),
    ),
    validator(
      "json",
      v.object({
        plannedDate: v.string(),
        taskIds: v.array(v.string()),
      }),
    ),
    workspaceAccess.fromQuery(),
    requireApiKeyScope({ task: ["update"] }),
    async (c) => {
      const { workspaceId } = c.req.valid("query");
      const { plannedDate, taskIds } = c.req.valid("json");

      const result = await setPlanOrder({
        workspaceId,
        userId: c.get("userId"),
        plannedDate: parseServerDay(plannedDate, "plannedDate"),
        taskIds,
      });

      return c.json(result);
    },
  )
  .put(
    "/:taskId",
    describeRoute({
      operationId: "setPersonalPlanEntry",
      tags: ["Planner"],
      description:
        "Place a task on a day of the current user's plan, or move it. Never changes the task's due date. Omitting `position` keeps the current one if the day doesn't change, or appends to the end of the destination day otherwise",
      responses: {
        200: {
          description: "Plan entry saved",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
        404: { description: "The task does not exist in this workspace" },
      },
    }),
    validator("param", v.object({ taskId: v.string() })),
    validator(
      "query",
      v.object({ workspaceId: v.pipe(v.string(), v.minLength(1)) }),
    ),
    validator(
      "json",
      v.object({
        plannedDate: v.string(),
        // Ausente: `setPlanEntry` la calcula -misma posicion si no cambia
        // de dia, al final si cambia o es nueva-. Sin default aqui: un `0`
        // por defecto mandaba siempre la tarea a la cabeza del dia de
        // destino al arrastrarla entre columnas del Cronograma, que nunca
        // manda posicion.
        position: v.optional(v.number()),
        // Anclar directamente al crear/mover, para que "crear desde el
        // Cronograma" sea una sola llamada en vez de PUT + PUT (ADR 041).
        startMinute: v.optional(v.nullable(startMinuteSchema)),
      }),
    ),
    workspaceAccess.fromQuery(),
    requireApiKeyScope({ task: ["update"] }),
    async (c) => {
      const { taskId } = c.req.valid("param");
      const { workspaceId } = c.req.valid("query");
      const body = c.req.valid("json");

      const entry = await setPlanEntry({
        workspaceId,
        userId: c.get("userId"),
        taskId,
        plannedDate: parseServerDay(body.plannedDate, "plannedDate"),
        position: body.position,
        startMinute: body.startMinute,
      });

      return c.json(entry);
    },
  )
  .delete(
    "/:taskId",
    describeRoute({
      operationId: "removePersonalPlanEntry",
      tags: ["Planner"],
      description: "Take a task back out of the current user's plan",
      responses: {
        200: {
          description: "Plan entry removed",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
        404: { description: "The task was not on the current user's plan" },
      },
    }),
    validator("param", v.object({ taskId: v.string() })),
    validator(
      "query",
      v.object({ workspaceId: v.pipe(v.string(), v.minLength(1)) }),
    ),
    workspaceAccess.fromQuery(),
    requireApiKeyScope({ task: ["update"] }),
    async (c) => {
      const { taskId } = c.req.valid("param");
      const { workspaceId } = c.req.valid("query");
      const deleted = await removePlanEntry({
        userId: c.get("userId"),
        workspaceId,
        taskId,
      });

      return c.json(deleted);
    },
  );

export default planner;
