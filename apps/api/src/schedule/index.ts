import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import { parseCadence } from "../recurrence/cadence";
import { parseServerDay } from "../utils/day-boundaries";
import { requireApiKeyScope } from "../utils/require-workspace-permission";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import createBlock from "./controllers/create-block";
import deleteBlock from "./controllers/delete-block";
import getSchedule from "./controllers/get-schedule";
import setEntryTime from "./controllers/set-entry-time";
import updateBlock from "./controllers/update-block";

const MAX_WINDOW_DAYS = 30;
const DEFAULT_WINDOW_DAYS = 7;

/** Las excepciones de `parseCadence` son errores de quien llama, no del servidor. */
function asBadRequest<T>(parse: () => T): T {
  try {
    return parse();
  } catch (error) {
    throw new HTTPException(400, {
      message: error instanceof Error ? error.message : "Invalid payload",
    });
  }
}

/** CHECK `schedule_block_minutes_valid` (`schema.ts`): 0-1439, no 0-1440. */
const startMinuteSchema = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(0),
  v.maxValue(1439),
);
/** Misma CHECK: `endMinute` llega hasta 1440 (medianoche exclusiva). */
const endMinuteSchema = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(1),
  v.maxValue(1440),
);

const blockBodySchema = v.object({
  title: v.pipe(v.string(), v.minLength(1)),
  kind: v.picklist(["fixed", "break"]),
  startMinute: startMinuteSchema,
  endMinute: endMinuteSchema,
  plannedDate: v.optional(v.string()),
  cadence: v.optional(v.record(v.string(), v.unknown())),
});

/**
 * El Cronograma (ADR 041): una vista por horas de lo que ya decidio el
 * Planificador (`personal_plan_entry`), mas las citas fijas y bloqueos que no
 * son tareas (`schedule_block`). No planea nada nuevo — anclar una entrada a
 * una hora requiere que ya tenga dia en el plan.
 */
const schedule = new Hono<{
  Variables: {
    userId: string;
    workspaceId: string;
  };
}>()
  .get(
    "/",
    describeRoute({
      operationId: "getSchedule",
      tags: ["Schedule"],
      description:
        "The current user's hourly layout for a rolling window: planned entries placed in time, fixed blocks, and the running timer",
      responses: {
        200: {
          description: "The schedule for the requested window",
          content: { "application/json": { schema: resolver(v.any()) } },
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

      const result = await getSchedule({
        workspaceId,
        userId: c.get("userId"),
        windowStart,
        windowEnd,
      });

      return c.json(result);
    },
  )
  .put(
    "/entries/:taskId",
    describeRoute({
      operationId: "setScheduleEntryTime",
      tags: ["Schedule"],
      description:
        "Anchor a plan entry to a clock time, or clear it back to flowing",
      responses: {
        200: {
          description: "Entry updated",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
        404: { description: "The task is not on the current user's plan" },
      },
    }),
    validator("param", v.object({ taskId: v.string() })),
    validator(
      "query",
      v.object({ workspaceId: v.pipe(v.string(), v.minLength(1)) }),
    ),
    validator("json", v.object({ startMinute: v.nullable(startMinuteSchema) })),
    workspaceAccess.fromQuery(),
    requireApiKeyScope({ task: ["update"] }),
    async (c) => {
      const { taskId } = c.req.valid("param");
      const { workspaceId } = c.req.valid("query");
      const { startMinute } = c.req.valid("json");

      const entry = await setEntryTime({
        userId: c.get("userId"),
        workspaceId,
        taskId,
        startMinute,
      });

      return c.json(entry);
    },
  )
  .post(
    "/blocks",
    describeRoute({
      operationId: "createScheduleBlock",
      tags: ["Schedule"],
      description:
        "Create a fixed appointment or break that is not a task, single or repeating",
      responses: {
        200: {
          description: "Block created",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
      },
    }),
    validator(
      "query",
      v.object({ workspaceId: v.pipe(v.string(), v.minLength(1)) }),
    ),
    validator("json", blockBodySchema),
    workspaceAccess.fromQuery(),
    requireApiKeyScope({ task: ["update"] }),
    async (c) => {
      const { workspaceId } = c.req.valid("query");
      const body = c.req.valid("json");

      if (Boolean(body.plannedDate) === Boolean(body.cadence)) {
        throw new HTTPException(400, {
          message: "Give either plannedDate or cadence, never both or neither",
        });
      }
      if (body.endMinute <= body.startMinute) {
        throw new HTTPException(400, {
          message: "endMinute must be after startMinute",
        });
      }

      const cadence = body.cadence
        ? asBadRequest(() => parseCadence(body.cadence))
        : null;
      const plannedDate = body.plannedDate
        ? parseServerDay(body.plannedDate, "plannedDate")
        : null;

      const block = await createBlock({
        workspaceId,
        userId: c.get("userId"),
        title: body.title,
        kind: body.kind,
        startMinute: body.startMinute,
        endMinute: body.endMinute,
        plannedDate,
        cadence,
      });

      return c.json(block);
    },
  )
  .patch(
    "/blocks/:id",
    describeRoute({
      operationId: "updateScheduleBlock",
      tags: ["Schedule"],
      description: "Update a block's title, kind or hours",
      responses: {
        200: {
          description: "Block updated",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
        404: { description: "The block was not found" },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator(
      "query",
      v.object({ workspaceId: v.pipe(v.string(), v.minLength(1)) }),
    ),
    validator(
      "json",
      v.object({
        title: v.pipe(v.string(), v.minLength(1)),
        kind: v.picklist(["fixed", "break"]),
        startMinute: startMinuteSchema,
        endMinute: endMinuteSchema,
      }),
    ),
    workspaceAccess.fromQuery(),
    requireApiKeyScope({ task: ["update"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const { workspaceId } = c.req.valid("query");
      const body = c.req.valid("json");

      if (body.endMinute <= body.startMinute) {
        throw new HTTPException(400, {
          message: "endMinute must be after startMinute",
        });
      }

      const block = await updateBlock({
        userId: c.get("userId"),
        workspaceId,
        id,
        title: body.title,
        kind: body.kind,
        startMinute: body.startMinute,
        endMinute: body.endMinute,
      });

      return c.json(block);
    },
  )
  .delete(
    "/blocks/:id",
    describeRoute({
      operationId: "deleteScheduleBlock",
      tags: ["Schedule"],
      description: "Delete a fixed block",
      responses: {
        200: {
          description: "Block deleted",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
        404: { description: "The block was not found" },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator(
      "query",
      v.object({ workspaceId: v.pipe(v.string(), v.minLength(1)) }),
    ),
    workspaceAccess.fromQuery(),
    requireApiKeyScope({ task: ["update"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const { workspaceId } = c.req.valid("query");
      const block = await deleteBlock({
        userId: c.get("userId"),
        workspaceId,
        id,
      });

      return c.json(block);
    },
  );

export default schedule;
