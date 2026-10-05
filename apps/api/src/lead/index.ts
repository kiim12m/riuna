import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import { unavailableDaySchema } from "../schemas";
import { parseServerDay } from "../utils/day-boundaries";
import { dayKeySchema } from "../utils/day-key-schema";
import { requireApiKeyScope } from "../utils/require-workspace-permission";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import getMyLeads from "./controllers/get-my-leads";
import getTeamDay from "./controllers/get-team-day";
import getTeamMembers from "./controllers/get-team-members";
import getTeamStandup from "./controllers/get-team-standup";

const personSchema = {
  id: v.string(),
  name: v.string(),
  image: v.nullable(v.string()),
};

const taskSchema = {
  id: v.string(),
  number: v.nullable(v.number()),
  title: v.string(),
  projectSlug: v.string(),
};

const standupTaskSchema = v.object({
  ...taskSchema,
  keyRank: v.nullable(v.number()),
});

const teamDaySchema = v.object({
  day: v.string(),
  members: v.array(
    v.object({
      ...personSchema,
      unavailable: v.nullable(unavailableDaySchema),
      load: v.object({
        loadSeconds: v.number(),
        capacitySeconds: v.number(),
        pct: v.number(),
      }),
      planned: v.array(
        v.object({
          ...taskSchema,
          startMinute: v.nullable(v.number()),
          keyRank: v.nullable(v.number()),
          estimate: v.nullable(v.number()),
          loggedSeconds: v.number(),
          isDone: v.boolean(),
        }),
      ),
      done: v.array(v.object(taskSchema)),
      workedSeconds: v.number(),
      /** Solo la parte visible del cierre: nunca la valoracion (ADR 054). */
      close: v.nullable(
        v.object({
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
    }),
  ),
});

const teamStandupSchema = v.object({
  members: v.array(
    v.object({
      ...personSchema,
      standup: v.object({
        yesterday: v.object({
          day: v.string(),
          done: v.array(standupTaskSchema),
          closed: v.boolean(),
        }),
        today: v.object({
          day: v.string(),
          planned: v.array(standupTaskSchema),
        }),
        blockers: v.nullable(v.string()),
      }),
    }),
  ),
});

const workspaceQuery = v.object({
  workspaceId: v.pipe(v.string(), v.minLength(1)),
});

const json = <T extends v.GenericSchema>(description: string, schema: T) => ({
  200: {
    description,
    content: { "application/json": { schema: resolver(schema) } },
  },
});

/**
 * Lo que lee el responsable de departamento (ADR 059), y quien es el de
 * quien mira. **Ningun endpoint de aqui escribe** -marcar a alguien es cosa
 * de `team-lead/`-, y todo pasa por `visibility.ts`. Dos pruebas de
 * arquitectura lo vigilan: `tests/api/lead-read-only.test.ts` y la de la
 * valoracion privada (ADR 054).
 */
const lead = new Hono<{
  Variables: {
    userId: string;
    workspaceId: string;
  };
}>()
  .get(
    "/my-leads",
    describeRoute({
      operationId: "getMyLeads",
      tags: ["Lead"],
      description:
        "Who leads the current user in this workspace: the people who can read their plan and their day closes, never their private rating",
      responses: json(
        "The current user's leads",
        v.array(v.object({ id: v.string(), name: v.string() })),
      ),
    }),
    validator("query", workspaceQuery),
    workspaceAccess.fromQuery(),
    requireApiKeyScope({ task: ["read"] }),
    async (c) =>
      c.json(
        await getMyLeads({
          workspaceId: c.get("workspaceId"),
          userId: c.get("userId"),
        }),
      ),
  )
  .get(
    "/members",
    describeRoute({
      operationId: "getTeamMembers",
      tags: ["Lead"],
      description:
        "The people the current user leads in this workspace. Empty for anyone who leads nobody",
      responses: json("The led people", v.array(v.object(personSchema))),
    }),
    validator("query", workspaceQuery),
    workspaceAccess.fromQuery(),
    requireApiKeyScope({ task: ["read"] }),
    async (c) =>
      c.json(
        await getTeamMembers({
          workspaceId: c.get("workspaceId"),
          leadUserId: c.get("userId"),
        }),
      ),
  )
  .get(
    "/day",
    describeRoute({
      operationId: "getTeamDay",
      tags: ["Lead"],
      description:
        "Read-only: for each person the current user leads, their plan for a day (default the server's today), capacity with absences and holidays, load, what they finished, the time they logged and the visible part of their day close. Never their private rating",
      responses: json("The team's day", teamDaySchema),
    }),
    validator(
      "query",
      v.object({
        ...workspaceQuery.entries,
        date: v.optional(dayKeySchema),
      }),
    ),
    workspaceAccess.fromQuery(),
    requireApiKeyScope({ task: ["read"] }),
    async (c) => {
      const { date } = c.req.valid("query");
      return c.json(
        await getTeamDay({
          workspaceId: c.get("workspaceId"),
          leadUserId: c.get("userId"),
          day: date ? parseServerDay(date, "date") : new Date(),
        }),
      );
    },
  )
  .get(
    "/standup",
    describeRoute({
      operationId: "getTeamStandup",
      tags: ["Lead"],
      description:
        "Read-only: the stand-up of each person the current user leads, the same one they see in Today",
      responses: json("The team's stand-up", teamStandupSchema),
    }),
    validator("query", workspaceQuery),
    workspaceAccess.fromQuery(),
    requireApiKeyScope({ task: ["read"] }),
    async (c) =>
      c.json(
        await getTeamStandup({
          workspaceId: c.get("workspaceId"),
          leadUserId: c.get("userId"),
        }),
      ),
  );

export default lead;
