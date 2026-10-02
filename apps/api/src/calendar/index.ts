import type { Context, Next } from "hono";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import createFeed from "./controllers/create-feed";
import deleteFeed from "./controllers/delete-feed";
import getFeed from "./controllers/get-feed";

const feedStatusSchema = v.object({
  active: v.boolean(),
  createdAt: v.nullable(v.date()),
});

const createdFeedSchema = v.object({
  /** Solo aqui: se guarda su hash, nunca el token (ADR 057). */
  token: v.string(),
  createdAt: v.date(),
});

const workspaceQuery = validator(
  "query",
  v.object({ workspaceId: v.pipe(v.string(), v.minLength(1)) }),
);

/**
 * El enlace del calendario solo se gestiona con sesion (ADR 057): si no, una
 * clave de API de solo lectura podria fabricar una credencial permanente y
 * sin autenticacion para leer el plan.
 */
async function sessionOnly(c: Context, next: Next) {
  if (c.get("apiKey")) {
    throw new HTTPException(403, {
      message: "Calendar feeds can only be managed with a session",
    });
  }
  return next();
}

/**
 * El enlace del calendario de quien mira en un espacio. El feed en si,
 * `GET /api/calendar/:token.ics`, se sirve fuera de aqui, antes de la
 * autenticacion (`index.ts`).
 */
const calendar = new Hono<{
  Variables: {
    userId: string;
    workspaceId: string;
  };
}>()
  .get(
    "/feed",
    describeRoute({
      operationId: "getCalendarFeed",
      tags: ["Calendar"],
      description:
        "Whether the current user has a calendar feed link in this workspace, and since when. Never the token, which is only shown once",
      responses: {
        200: {
          description: "The calendar feed status",
          content: {
            "application/json": { schema: resolver(feedStatusSchema) },
          },
        },
      },
    }),
    sessionOnly,
    workspaceQuery,
    workspaceAccess.fromQuery(),
    async (c) =>
      c.json(
        await getFeed({
          workspaceId: c.get("workspaceId"),
          userId: c.get("userId"),
        }),
      ),
  )
  .post(
    "/feed",
    describeRoute({
      operationId: "createCalendarFeed",
      tags: ["Calendar"],
      description:
        "Create the current user's calendar feed link in this workspace, or regenerate it: the previous token stops working. The token is returned only here",
      responses: {
        200: {
          description: "The new token",
          content: {
            "application/json": { schema: resolver(createdFeedSchema) },
          },
        },
      },
    }),
    sessionOnly,
    workspaceQuery,
    workspaceAccess.fromQuery(),
    async (c) =>
      c.json(
        await createFeed({
          workspaceId: c.get("workspaceId"),
          userId: c.get("userId"),
        }),
      ),
  )
  .delete(
    "/feed",
    describeRoute({
      operationId: "deleteCalendarFeed",
      tags: ["Calendar"],
      description:
        "Revoke the current user's calendar feed link in this workspace",
      responses: {
        200: {
          description: "The calendar feed status, now inactive",
          content: {
            "application/json": { schema: resolver(feedStatusSchema) },
          },
        },
      },
    }),
    sessionOnly,
    workspaceQuery,
    workspaceAccess.fromQuery(),
    async (c) =>
      c.json(
        await deleteFeed({
          workspaceId: c.get("workspaceId"),
          userId: c.get("userId"),
        }),
      ),
  );

export default calendar;
