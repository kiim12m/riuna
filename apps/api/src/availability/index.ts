import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import { dayKeySchema } from "../utils/day-key-schema";
import {
  requireApiKeyScope,
  requireWorkspacePermission,
} from "../utils/require-workspace-permission";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import {
  createHoliday,
  deleteHoliday,
  listHolidays,
} from "./controllers/holidays";
import {
  createTimeOff,
  deleteTimeOff,
  listTimeOff,
} from "./controllers/time-off";

const workspaceQuery = validator(
  "query",
  v.object({ workspaceId: v.pipe(v.string(), v.minLength(1)) }),
);

const timeOffSchema = v.object({
  id: v.string(),
  startsOn: v.date(),
  endsOn: v.date(),
  /** Solo para su dueño: ninguna otra lectura la devuelve (ADR 060). */
  note: v.nullable(v.string()),
});

const holidaySchema = v.object({
  id: v.string(),
  day: v.date(),
  name: v.string(),
});

const deletedSchema = v.object({ id: v.string() });

const json = <T extends v.GenericSchema>(description: string, schema: T) => ({
  200: {
    description,
    content: { "application/json": { schema: resolver(schema) } },
  },
});

/**
 * Los dias no disponibles (ADR 060): las ausencias de quien mira, que solo
 * gestiona ella, y los festivos del espacio, que leen todos y gestiona quien
 * administra el espacio. La capacidad que restan se calcula en
 * `work-schedule/unavailable-days.ts`.
 */
const availability = new Hono<{
  Variables: {
    userId: string;
    workspaceId: string;
  };
}>()
  .get(
    "/time-off",
    describeRoute({
      operationId: "listTimeOff",
      tags: ["Availability"],
      description:
        "The current user's absences in this workspace that have not ended yet, with their private note",
      responses: json("The absences", v.array(timeOffSchema)),
    }),
    workspaceQuery,
    workspaceAccess.fromQuery(),
    requireApiKeyScope({ task: ["read"] }),
    async (c) =>
      c.json(
        await listTimeOff({
          workspaceId: c.get("workspaceId"),
          userId: c.get("userId"),
        }),
      ),
  )
  .post(
    "/time-off",
    describeRoute({
      operationId: "createTimeOff",
      tags: ["Availability"],
      description:
        "Add an absence for the current user: a range of days, at most a year, with an optional private note. There is no reason field on purpose",
      responses: json("The new absence", timeOffSchema),
    }),
    workspaceQuery,
    validator(
      "json",
      v.object({
        startsOn: dayKeySchema,
        endsOn: dayKeySchema,
        note: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(500)))),
      }),
    ),
    workspaceAccess.fromQuery(),
    requireApiKeyScope({ task: ["update"] }),
    async (c) => {
      const body = c.req.valid("json");
      return c.json(
        await createTimeOff({
          workspaceId: c.get("workspaceId"),
          userId: c.get("userId"),
          startsOn: body.startsOn,
          endsOn: body.endsOn,
          note: body.note ?? null,
        }),
      );
    },
  )
  .delete(
    "/time-off/:id",
    describeRoute({
      operationId: "deleteTimeOff",
      tags: ["Availability"],
      description: "Remove one of the current user's absences",
      responses: json("The removed absence", deletedSchema),
    }),
    validator("param", v.object({ id: v.string() })),
    workspaceQuery,
    workspaceAccess.fromQuery(),
    requireApiKeyScope({ task: ["update"] }),
    async (c) =>
      c.json(
        await deleteTimeOff({
          workspaceId: c.get("workspaceId"),
          userId: c.get("userId"),
          id: c.req.valid("param").id,
        }),
      ),
  )
  .get(
    "/holidays",
    describeRoute({
      operationId: "listHolidays",
      tags: ["Availability"],
      description:
        "The workspace's holidays from a month ago on. Every member can read them: they show in their planner",
      responses: json("The holidays", v.array(holidaySchema)),
    }),
    workspaceQuery,
    workspaceAccess.fromQuery(),
    requireApiKeyScope({ workspace: ["read"] }),
    async (c) =>
      c.json(await listHolidays({ workspaceId: c.get("workspaceId") })),
  )
  .post(
    "/holidays",
    describeRoute({
      operationId: "createHoliday",
      tags: ["Availability"],
      description:
        "Add a holiday to the workspace: one per day, 409 if the day already has one",
      responses: json("The new holiday", holidaySchema),
    }),
    workspaceQuery,
    validator(
      "json",
      v.object({
        day: dayKeySchema,
        name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(100)),
      }),
    ),
    workspaceAccess.fromQuery(),
    requireWorkspacePermission({ workspace: ["manage_settings"] }),
    async (c) => {
      const body = c.req.valid("json");
      return c.json(
        await createHoliday({
          workspaceId: c.get("workspaceId"),
          day: body.day,
          name: body.name,
        }),
      );
    },
  )
  .delete(
    "/holidays/:id",
    describeRoute({
      operationId: "deleteHoliday",
      tags: ["Availability"],
      description: "Remove a holiday from the workspace",
      responses: json("The removed holiday", deletedSchema),
    }),
    validator("param", v.object({ id: v.string() })),
    workspaceQuery,
    workspaceAccess.fromQuery(),
    requireWorkspacePermission({ workspace: ["manage_settings"] }),
    async (c) =>
      c.json(
        await deleteHoliday({
          workspaceId: c.get("workspaceId"),
          id: c.req.valid("param").id,
        }),
      ),
  );

export default availability;
