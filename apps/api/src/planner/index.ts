import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import { parseServerDay } from "../utils/day-boundaries";
import { requireApiKeyScope } from "../utils/require-workspace-permission";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import getPlan from "./controllers/get-plan";
import removePlanEntry from "./controllers/remove-plan-entry";
import setPlanEntry from "./controllers/set-plan-entry";

const MAX_WINDOW_DAYS = 60;
const DEFAULT_WINDOW_DAYS = 15;

const planTaskSchema = v.object({
  id: v.string(),
  number: v.number(),
  title: v.string(),
  status: v.string(),
  priority: v.string(),
  estimate: v.nullable(v.number()),
  dueDate: v.nullable(v.date()),
  projectId: v.string(),
  projectName: v.string(),
  projectSlug: v.string(),
  projectIcon: v.nullable(v.string()),
  teamId: v.nullable(v.string()),
  teamName: v.nullable(v.string()),
  statusColumn: v.nullable(
    v.object({
      slug: v.string(),
      name: v.string(),
      icon: v.nullable(v.string()),
      isFinal: v.boolean(),
    }),
  ),
  isDone: v.boolean(),
  labels: v.array(
    v.object({ id: v.string(), name: v.string(), color: v.string() }),
  ),
  assignees: v.array(
    v.object({
      id: v.string(),
      name: v.string(),
      image: v.nullable(v.string()),
    }),
  ),
});

const planEntrySchema = v.object({
  ...planTaskSchema.entries,
  plannedDate: v.date(),
  position: v.number(),
});

const planGhostSchema = v.object({
  recurrenceId: v.string(),
  title: v.string(),
  estimate: v.nullable(v.number()),
  plannedDate: v.date(),
});

const planResponseSchema = v.object({
  entries: v.array(planEntrySchema),
  unplanned: v.array(planTaskSchema),
  ghosts: v.array(planGhostSchema),
  capacitySeconds: v.number(),
  /** El dia del servidor, `yyyy-mm-dd`: de ahi arranca la rejilla de 15 dias. */
  serverToday: v.string(),
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

      const windowStart = new Date();
      windowStart.setHours(0, 0, 0, 0);
      const windowEnd = new Date(windowStart);
      windowEnd.setDate(windowEnd.getDate() + days - 1);
      windowEnd.setHours(23, 59, 59, 999);

      const plan = await getPlan({
        workspaceId,
        userId: c.get("userId"),
        windowStart,
        windowEnd,
      });

      return c.json(plan);
    },
  )
  .put(
    "/:taskId",
    describeRoute({
      operationId: "setPersonalPlanEntry",
      tags: ["Planner"],
      description:
        "Place a task on a day of the current user's plan, or move it. Never changes the task's due date",
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
        position: v.optional(v.number(), 0),
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
