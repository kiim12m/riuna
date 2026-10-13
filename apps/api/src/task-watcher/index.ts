import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import {
  hasWorkspacePermission,
  requireWorkspacePermission,
} from "../utils/require-workspace-permission";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import setWatching from "./controllers/set-watching";
import { listTaskWatchers } from "./watchers";

const watcherSchema = v.object({
  userId: v.string(),
  name: v.nullable(v.string()),
  image: v.nullable(v.string()),
  watching: v.boolean(),
  assignee: v.boolean(),
});

const watcherListResponse = {
  description:
    "Who watches the task: its assignees, who always do, and whoever watches it on purpose",
  content: {
    "application/json": { schema: resolver(v.array(watcherSchema)) },
  },
};

/**
 * Observarse a uno mismo basta con ver la tarea; poner o quitar a otra
 * persona es repartir, asi que pide `task:assign` (ADR 076).
 */
async function assertCanChange(
  c: Parameters<typeof hasWorkspacePermission>[0],
  targetId: string,
) {
  if (targetId === c.get("userId")) return;
  if (!(await hasWorkspacePermission(c, { task: ["assign"] }))) {
    throw new HTTPException(403, { message: "Insufficient permissions" });
  }
}

const taskWatcher = new Hono<{
  Variables: {
    userId: string;
    workspaceId: string;
  };
}>()
  .get(
    "/:taskId",
    describeRoute({
      operationId: "listTaskWatchers",
      tags: ["Task Watchers"],
      description:
        "Who watches a task. Assignees always do and are flagged `assignee`; `watching` means a row of its own, which is what unwatching removes",
      responses: { 200: watcherListResponse },
    }),
    validator("param", v.object({ taskId: v.string() })),
    workspaceAccess.fromTaskId("taskId"),
    requireWorkspacePermission({ task: ["read"] }),
    async (c) => {
      const { taskId } = c.req.valid("param");
      return c.json(await listTaskWatchers(taskId, c.get("workspaceId")));
    },
  )
  .post(
    "/:taskId",
    describeRoute({
      operationId: "watchTask",
      tags: ["Task Watchers"],
      description:
        "Watch a task: its comments and its status and due date changes reach you as notifications. Without `userId` it is you; adding someone else needs task:assign and a member of the workspace",
      responses: { 200: watcherListResponse },
    }),
    validator("param", v.object({ taskId: v.string() })),
    validator(
      "json",
      v.object({
        userId: v.optional(v.pipe(v.string(), v.minLength(1))),
      }),
    ),
    workspaceAccess.fromTaskId("taskId"),
    requireWorkspacePermission({ task: ["read"] }),
    async (c) => {
      const { taskId } = c.req.valid("param");
      const targetId = c.req.valid("json").userId ?? c.get("userId");
      await assertCanChange(c, targetId);
      return c.json(
        await setWatching({
          taskId,
          workspaceId: c.get("workspaceId"),
          actorId: c.get("userId"),
          targetId,
          watch: true,
        }),
      );
    },
  )
  .delete(
    "/:taskId",
    describeRoute({
      operationId: "unwatchTask",
      tags: ["Task Watchers"],
      description:
        "Stop watching a task. Without `userId` it is you; removing someone else needs task:assign. An assignee keeps being notified while assigned",
      responses: { 200: watcherListResponse },
    }),
    validator("param", v.object({ taskId: v.string() })),
    validator(
      "query",
      v.object({
        userId: v.optional(v.pipe(v.string(), v.minLength(1))),
      }),
    ),
    workspaceAccess.fromTaskId("taskId"),
    requireWorkspacePermission({ task: ["read"] }),
    async (c) => {
      const { taskId } = c.req.valid("param");
      const targetId = c.req.valid("query").userId ?? c.get("userId");
      await assertCanChange(c, targetId);
      return c.json(
        await setWatching({
          taskId,
          workspaceId: c.get("workspaceId"),
          actorId: c.get("userId"),
          targetId,
          watch: false,
        }),
      );
    },
  );

export default taskWatcher;
