import { and, desc, eq, gt, ne } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import db from "../database";
import { sessionTable } from "../database/schema";
import { log } from "../utils/log";

// Sesiones activas (ADR 079): donde tienes Riuna abierto y cerrar las que no.
// Sale el `id` de cada sesion y nunca su `token`, que es la credencial: con el,
// quien lo leyera entraria en ese dispositivo.

const sessionSchema = v.object({
  id: v.string(),
  current: v.boolean(),
  userAgent: v.nullable(v.string()),
  ipAddress: v.nullable(v.string()),
  createdAt: v.string(),
  updatedAt: v.string(),
  expiresAt: v.string(),
  impersonated: v.boolean(),
});

/**
 * Solo con una sesion de navegador: una clave de API no es una sesion y no
 * debe poder echar a nadie de su cuenta.
 */
function currentSession(c: Context) {
  const session = c.get("session") as { id?: string } | null;
  if (c.get("apiKey") || !session?.id) {
    throw new HTTPException(403, {
      message: "Sessions are managed from a signed-in browser",
    });
  }
  return { sessionId: session.id, userId: c.get("userId") as string };
}

const sessions = new Hono<{
  Variables: { userId: string };
}>()
  .get(
    "/",
    describeRoute({
      operationId: "listMySessions",
      tags: ["Sessions"],
      description:
        "Where you are signed in: your unexpired sessions, the current one first and then by last refresh. Never includes session tokens",
      responses: {
        200: {
          description: "Your sessions",
          content: {
            "application/json": { schema: resolver(v.array(sessionSchema)) },
          },
        },
      },
    }),
    async (c) => {
      const { sessionId, userId } = currentSession(c);
      const rows = await db
        .select({
          id: sessionTable.id,
          userAgent: sessionTable.userAgent,
          ipAddress: sessionTable.ipAddress,
          createdAt: sessionTable.createdAt,
          updatedAt: sessionTable.updatedAt,
          expiresAt: sessionTable.expiresAt,
          impersonatedBy: sessionTable.impersonatedBy,
        })
        .from(sessionTable)
        .where(
          and(
            eq(sessionTable.userId, userId),
            gt(sessionTable.expiresAt, new Date()),
          ),
        )
        .orderBy(desc(sessionTable.updatedAt));

      const list = rows.map(({ impersonatedBy, ...row }) => ({
        id: row.id,
        current: row.id === sessionId,
        userAgent: row.userAgent,
        ipAddress: row.ipAddress,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
        impersonated: Boolean(impersonatedBy),
      }));
      list.sort((a, b) => Number(b.current) - Number(a.current));
      return c.json(list);
    },
  )
  .delete(
    "/others",
    describeRoute({
      operationId: "revokeMyOtherSessions",
      tags: ["Sessions"],
      description:
        "Sign out everywhere but here. Each device has to sign in again within a few minutes, once its cached session expires",
      responses: {
        200: {
          description: "How many sessions were closed",
          content: {
            "application/json": {
              schema: resolver(v.object({ revoked: v.number() })),
            },
          },
        },
      },
    }),
    async (c) => {
      const { sessionId, userId } = currentSession(c);
      const removed = await db
        .delete(sessionTable)
        .where(
          and(eq(sessionTable.userId, userId), ne(sessionTable.id, sessionId)),
        )
        .returning({ id: sessionTable.id });
      log.info("Other sessions revoked", { userId, revoked: removed.length });
      return c.json({ revoked: removed.length });
    },
  )
  .delete(
    "/:id",
    describeRoute({
      operationId: "revokeMySession",
      tags: ["Sessions"],
      description:
        "Close one of your other sessions. The current one is closed by signing out",
      responses: {
        200: {
          description: "The session was closed",
          content: {
            "application/json": {
              schema: resolver(v.object({ revoked: v.number() })),
            },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.pipe(v.string(), v.minLength(1)) })),
    async (c) => {
      const { sessionId, userId } = currentSession(c);
      const { id } = c.req.valid("param");
      if (id === sessionId) {
        throw new HTTPException(400, {
          message: "Sign out to close the current session",
        });
      }
      const removed = await db
        .delete(sessionTable)
        .where(and(eq(sessionTable.id, id), eq(sessionTable.userId, userId)))
        .returning({ id: sessionTable.id });
      if (removed.length === 0) {
        throw new HTTPException(404, { message: "Session not found" });
      }
      log.info("Session revoked", { userId });
      return c.json({ revoked: removed.length });
    },
  );

export default sessions;
