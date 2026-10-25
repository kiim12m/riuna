import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import { projectSchema, taskSchema } from "../schemas";
import { VALID_PRIORITIES } from "../task/validate-task-fields";
import { dayKeySchema } from "../utils/day-key-schema";
import {
  requireApiKeyScope,
  requireWorkspacePermission,
} from "../utils/require-workspace-permission";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import captureTask from "./controllers/capture-task";
import { ensureInbox, findInbox } from "./inbox";

const inboxResponseSchema = v.object({ inbox: v.nullable(projectSchema) });

const workspaceIdSchema = v.object({
  workspaceId: v.pipe(v.string(), v.minLength(1)),
});

const captureSchema = v.object({
  workspaceId: v.pipe(v.string(), v.minLength(1)),
  title: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(500)),
  projectId: v.optional(v.pipe(v.string(), v.minLength(1))),
  priority: v.optional(v.picklist(VALID_PRIORITIES)),
  estimate: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
  dueDate: v.optional(dayKeySchema),
  plannedDate: v.optional(dayKeySchema),
  /** CHECK `personal_plan_entry_start_minute_valid`: 0-1439. */
  startMinute: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(1439)),
  ),
  labelIds: v.optional(
    v.pipe(v.array(v.pipe(v.string(), v.minLength(1))), v.maxLength(20)),
  ),
});

const captureResponseSchema = v.object({
  task: taskSchema,
  projectSlug: v.string(),
  /** Si cayo en la Bandeja de quien captura. */
  inInbox: v.boolean(),
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
    async (c) => {
      const inbox = await ensureInbox(c.get("workspaceId"), c.get("userId"));
      return c.json({ inbox: inbox ?? null });
    },
  )
  .post(
    "/",
    describeRoute({
      operationId: "captureTask",
      tags: ["Capture"],
      description:
        "Create a task assigned to the current user, in their inbox unless a project is given. plannedDate places it on a day of the personal plan and never sets the due date; dueDate is the due date. Labels must be workspace labels",
      responses: {
        200: {
          description: "The captured task",
          content: {
            "application/json": { schema: resolver(captureResponseSchema) },
          },
        },
      },
    }),
    validator("json", captureSchema),
    workspaceAccess.fromBody(),
    requireWorkspacePermission({ task: ["create"] }),
    async (c) => {
      const captured = await captureTask({
        ...c.req.valid("json"),
        workspaceId: c.get("workspaceId"),
        userId: c.get("userId"),
      });
      return c.json(captured);
    },
  );

export default capture;
