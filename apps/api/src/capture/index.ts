import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import { requireEntitlement } from "../billing/require-entitlement-middleware";
import { projectSchema } from "../schemas";
import {
  requireApiKeyScope,
  requireWorkspacePermission,
} from "../utils/require-workspace-permission";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import { ensureInbox, findInbox } from "./inbox";

const inboxResponseSchema = v.object({ inbox: v.nullable(projectSchema) });

const workspaceIdSchema = v.object({
  workspaceId: v.pipe(v.string(), v.minLength(1)),
});

/**
 * Captura personal. La Bandeja es un proyecto por persona y espacio, oculto en
 * las listas de proyectos pero **no privado**: sus tareas salen en las
 * lecturas de tareas como las de cualquier otro proyecto (ADR 051).
 */
const capture = new Hono<{
  Variables: {
    userId: string;
    workspaceId: string;
  };
}>()
  .get(
    "/inbox",
    describeRoute({
      operationId: "getInbox",
      tags: ["Capture"],
      description:
        "The current user's inbox in a workspace, or null until it is first used. The inbox is a project hidden from project lists, not a private one",
      responses: {
        200: {
          description: "The inbox, or null",
          content: {
            "application/json": { schema: resolver(inboxResponseSchema) },
          },
        },
      },
    }),
    validator("query", workspaceIdSchema),
    workspaceAccess.fromQuery(),
    requireApiKeyScope({ project: ["read"] }),
    async (c) => {
      const inbox = await findInbox(c.get("workspaceId"), c.get("userId"));
      return c.json({ inbox });
    },
  )
  .post(
    "/inbox",
    describeRoute({
      operationId: "ensureInbox",
      tags: ["Capture"],
      description:
        "Return the current user's inbox in a workspace, creating it on first use. Idempotent: concurrent calls return the same project",
      responses: {
        200: {
          description: "The inbox",
          content: {
            "application/json": { schema: resolver(inboxResponseSchema) },
          },
        },
      },
    }),
    validator("json", workspaceIdSchema),
    workspaceAccess.fromBody(),
    requireWorkspacePermission({ task: ["create"] }),
    requireEntitlement,
    async (c) => {
      const inbox = await ensureInbox(c.get("workspaceId"), c.get("userId"));
      return c.json({ inbox: inbox ?? null });
    },
  );

export default capture;
