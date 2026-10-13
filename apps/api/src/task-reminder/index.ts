import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import { requireWorkspacePermission } from "../utils/require-workspace-permission";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import { clearReminder, getReminder, setReminder } from "./reminders";

const DAY_MS = 24 * 60 * 60 * 1000;
// Un minuto de margen: «dentro de un rato» calculado en el navegador puede
// llegar con el reloj del servidor un poco por delante.
const PAST_TOLERANCE_MS = 60 * 1000;
const MAX_AHEAD_MS = 366 * DAY_MS;

const reminderSchema = v.object({
  remindAt: v.string(),
  note: v.nullable(v.string()),
});

const reminderResponse = {
  description: "Your reminder on this task, or null when you have none",
  content: {
    "application/json": {
      schema: resolver(v.object({ reminder: v.nullable(reminderSchema) })),
    },
  },
};

function parseRemindAt(value: string) {
  const remindAt = new Date(value);
  const now = Date.now();
  if (Number.isNaN(remindAt.getTime())) {
    throw new HTTPException(400, { message: "Invalid reminder date" });
  }
  if (remindAt.getTime() < now - PAST_TOLERANCE_MS) {
    throw new HTTPException(400, {
      message: "The reminder must be in the future",
    });
  }
  if (remindAt.getTime() > now + MAX_AHEAD_MS) {
    throw new HTTPException(400, {
      message: "The reminder cannot be more than a year away",
    });
  }
  return remindAt;
}

const taskReminder = new Hono<{
  Variables: {
    userId: string;
    workspaceId: string;
  };
}>()
  .get(
    "/:taskId",
    describeRoute({
      operationId: "getTaskReminder",
      tags: ["Task Reminders"],
      description:
        "Your private reminder on a task. Nobody else sees it, and it does not plan the task into your day",
      responses: { 200: reminderResponse },
    }),
    validator("param", v.object({ taskId: v.string() })),
    workspaceAccess.fromTaskId("taskId"),
    requireWorkspacePermission({ task: ["read"] }),
    async (c) => {
      const { taskId } = c.req.valid("param");
      return c.json({ reminder: await getReminder(taskId, c.get("userId")) });
    },
  )
  .put(
    "/:taskId",
    describeRoute({
      operationId: "setTaskReminder",
      tags: ["Task Reminders"],
      description:
        "Remind me about this task at `remindAt` (an ISO instant, within a year), with an optional private note. It arrives once, through the bell and your channels. Replaces any reminder you already had on the task; leaving `note` out keeps its note, `null` clears it",
      responses: { 200: reminderResponse },
    }),
    validator("param", v.object({ taskId: v.string() })),
    validator(
      "json",
      v.object({
        remindAt: v.pipe(v.string(), v.minLength(1)),
        note: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(280)))),
      }),
    ),
    workspaceAccess.fromTaskId("taskId"),
    requireWorkspacePermission({ task: ["read"] }),
    async (c) => {
      const { taskId } = c.req.valid("param");
      const body = c.req.valid("json");
      // Sin `note` se conserva la que hubiera: el atajo del menu de fila solo
      // cambia la hora.
      const note =
        body.note === undefined ? undefined : body.note?.trim() || null;
      const reminder = await setReminder({
        taskId,
        userId: c.get("userId"),
        remindAt: parseRemindAt(body.remindAt),
        note,
      });
      return c.json({ reminder });
    },
  )
  .delete(
    "/:taskId",
    describeRoute({
      operationId: "clearTaskReminder",
      tags: ["Task Reminders"],
      description: "Remove your reminder on this task, if you had one",
      responses: { 200: reminderResponse },
    }),
    validator("param", v.object({ taskId: v.string() })),
    workspaceAccess.fromTaskId("taskId"),
    requireWorkspacePermission({ task: ["read"] }),
    async (c) => {
      const { taskId } = c.req.valid("param");
      await clearReminder(taskId, c.get("userId"));
      return c.json({ reminder: null });
    },
  );

export default taskReminder;
