import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import { parseServerDay } from "../utils/day-boundaries";
import { dayKeySchema } from "../utils/day-key-schema";
import { requireApiKeyScope } from "../utils/require-workspace-permission";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import closeDay from "./controllers/close-day";
import getReview from "./controllers/get-review";
import { closeWeek, getWeekReview } from "./controllers/week-review";
import { getStandup } from "./standup";

const optionalText = (max: number) =>
  v.optional(v.nullable(v.pipe(v.string(), v.trim(), v.maxLength(max))), null);

const privateSchema = v.nullable(
  v.object({
    impact: v.nullable(v.number()),
    energy: v.nullable(v.number()),
    note: v.nullable(v.string()),
  }),
);

const weekSummarySchema = v.object({
  done: v.number(),
  workedSeconds: v.number(),
  estimatedSeconds: v.number(),
  loggedOnEstimatedSeconds: v.number(),
});

const weekReviewSchema = v.object({
  review: v.nullable(
    v.object({
      closedAt: v.date(),
      blockers: v.nullable(v.string()),
      summary: weekSummarySchema,
    }),
  ),
  /** Solo para la propia persona: la valoracion nunca sale de aqui. */
  private: privateSchema,
  /** Las cifras de esa semana al dia, este cerrada o no. */
  stats: weekSummarySchema,
});

const ratingBody = {
  blockers: optionalText(2000),
  impact: v.optional(
    v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(4))),
    null,
  ),
  energy: v.optional(
    v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(3))),
    null,
  ),
  note: optionalText(4000),
};

const standupTaskSchema = v.object({
  id: v.string(),
  number: v.nullable(v.number()),
  title: v.string(),
  projectSlug: v.string(),
  keyRank: v.nullable(v.number()),
});

const standupSchema = v.object({
  /** El ultimo dia laborable antes de hoy, `yyyy-mm-dd`. */
  yesterday: v.object({
    day: v.string(),
    done: v.array(standupTaskSchema),
    closed: v.boolean(),
  }),
  today: v.object({ day: v.string(), planned: v.array(standupTaskSchema) }),
  /** Del cierre mas reciente, de hoy o de ayer. Nunca la valoracion. */
  blockers: v.nullable(v.string()),
});

const dayReviewSchema = v.object({
  review: v.nullable(
    v.object({
      closedAt: v.date(),
      blockers: v.nullable(v.string()),
      summary: v.object({
        done: v.number(),
        workedSeconds: v.number(),
        moved: v.number(),
        unplanned: v.number(),
        focusSessions: v.optional(v.number()),
      }),
    }),
  ),
  /** Solo para la propia persona: la valoracion nunca sale de aqui. */
  private: privateSchema,
});

/**
 * Los cierres de periodo de quien mira (ADR 054). Todo va por la sesion: no
 * hay forma de pedir el cierre de otra persona por aqui. El responsable de
 * departamento tendra su propio modulo, que no puede leer `review_private`.
 */
const review = new Hono<{
  Variables: {
    userId: string;
    workspaceId: string;
  };
}>()
  .get(
    "/standup",
    describeRoute({
      operationId: "getStandup",
      tags: ["Review"],
      description:
        "The current user's stand-up, derived and never stored: what they finished on their last work day, today's plan with key tasks first, and the blockers of their latest day close. Never the private rating",
      responses: {
        200: {
          description: "The stand-up",
          content: {
            "application/json": { schema: resolver(standupSchema) },
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
    async (c) =>
      c.json(
        await getStandup({
          workspaceId: c.get("workspaceId"),
          userId: c.get("userId"),
        }),
      ),
  )
  .get(
    "/day/:date",
    describeRoute({
      operationId: "getDayReview",
      tags: ["Review"],
      description:
        "The current user's close of a day: blockers and figures, plus their private rating. Null until the day is closed",
      responses: {
        200: {
          description: "The day review",
          content: {
            "application/json": { schema: resolver(dayReviewSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ date: dayKeySchema })),
    validator(
      "query",
      v.object({ workspaceId: v.pipe(v.string(), v.minLength(1)) }),
    ),
    workspaceAccess.fromQuery(),
    requireApiKeyScope({ task: ["read"] }),
    async (c) => {
      const { date } = c.req.valid("param");
      return c.json(
        await getReview({
          workspaceId: c.get("workspaceId"),
          userId: c.get("userId"),
          period: "day",
          start: parseServerDay(date, "date"),
        }),
      );
    },
  )
  .put(
    "/day/:date",
    describeRoute({
      operationId: "closeDay",
      tags: ["Review"],
      description:
        "Close a day of the current user's plan: every pending task (planned that day or before, not done) needs a decision -a later day, or null to take it out of the plan-; then the blockers and figures are saved, and the private rating apart. Closing again updates it",
      responses: {
        200: {
          description: "The saved review",
          content: {
            "application/json": { schema: resolver(dayReviewSchema) },
          },
        },
        400: {
          description:
            "A pending task without a decision, a decision to the same day or before, or a future day",
        },
      },
    }),
    validator("param", v.object({ date: dayKeySchema })),
    validator(
      "query",
      v.object({ workspaceId: v.pipe(v.string(), v.minLength(1)) }),
    ),
    validator(
      "json",
      v.object({
        decisions: v.pipe(
          v.array(
            v.object({
              taskId: v.pipe(v.string(), v.minLength(1)),
              plannedDate: v.nullable(dayKeySchema),
            }),
          ),
          v.maxLength(500),
        ),
        ...ratingBody,
      }),
    ),
    workspaceAccess.fromQuery(),
    requireApiKeyScope({ task: ["update"] }),
    async (c) => {
      const { date } = c.req.valid("param");
      const body = c.req.valid("json");
      return c.json(
        await closeDay({
          workspaceId: c.get("workspaceId"),
          userId: c.get("userId"),
          date,
          decisions: body.decisions,
          blockers: body.blockers || null,
          impact: body.impact,
          energy: body.energy,
          note: body.note || null,
        }),
      );
    },
  )
  .get(
    "/week/:start",
    describeRoute({
      operationId: "getWeekReview",
      tags: ["Review"],
      description:
        "The current user's review of the seven days starting on `start`: the saved review and private rating, if any, and the week's figures as they stand",
      responses: {
        200: {
          description: "The week review",
          content: {
            "application/json": { schema: resolver(weekReviewSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ start: dayKeySchema })),
    validator(
      "query",
      v.object({ workspaceId: v.pipe(v.string(), v.minLength(1)) }),
    ),
    workspaceAccess.fromQuery(),
    requireApiKeyScope({ task: ["read"] }),
    async (c) => {
      const { start } = c.req.valid("param");
      return c.json(
        await getWeekReview({
          workspaceId: c.get("workspaceId"),
          userId: c.get("userId"),
          start: parseServerDay(start, "start"),
        }),
      );
    },
  )
  .put(
    "/week/:start",
    describeRoute({
      operationId: "closeWeek",
      tags: ["Review"],
      description:
        "Save the current user's weekly review of the seven days starting on `start`: blockers and the week's figures, plus the private rating apart. Saving again updates it",
      responses: {
        200: {
          description: "The saved week review",
          content: {
            "application/json": { schema: resolver(weekReviewSchema) },
          },
        },
        400: { description: "A week that has not started yet" },
      },
    }),
    validator("param", v.object({ start: dayKeySchema })),
    validator(
      "query",
      v.object({ workspaceId: v.pipe(v.string(), v.minLength(1)) }),
    ),
    validator("json", v.object(ratingBody)),
    workspaceAccess.fromQuery(),
    requireApiKeyScope({ task: ["update"] }),
    async (c) => {
      const { start } = c.req.valid("param");
      const body = c.req.valid("json");
      return c.json(
        await closeWeek({
          workspaceId: c.get("workspaceId"),
          userId: c.get("userId"),
          start: parseServerDay(start, "start"),
          blockers: body.blockers || null,
          impact: body.impact,
          energy: body.energy,
          note: body.note || null,
        }),
      );
    },
  );

export default review;
