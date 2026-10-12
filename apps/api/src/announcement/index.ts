import { type Context, Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import {
  hasWorkspacePermission,
  requireWorkspacePermission,
} from "../utils/require-workspace-permission";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import {
  type AnnouncementInput,
  assertAnnounceableProject,
  createAnnouncement,
  deleteAnnouncement,
  getAnnouncementScope,
  listAnnouncements,
  pinnedForProject,
  updateAnnouncement,
} from "./announcements";
// Los avisos a los miembros se suscriben al bus al cargarse.
import "./notify";

// Avisos de proyecto y de espacio (ADR 081). Leer pide ver el proyecto o el
// espacio; publicar, lo mismo que configurarlo: `project:update` en un
// proyecto y `workspace:manage_settings` en el espacio.

type Variables = { userId: string; workspaceId: string };

const announcementSchema = v.object({
  id: v.string(),
  workspaceId: v.string(),
  projectId: v.nullable(v.string()),
  title: v.string(),
  content: v.string(),
  pinned: v.boolean(),
  pinnedUntil: v.nullable(v.string()),
  pinnedNow: v.boolean(),
  notified: v.boolean(),
  author: v.nullable(
    v.object({
      id: v.string(),
      name: v.nullable(v.string()),
      image: v.nullable(v.string()),
    }),
  ),
  createdAt: v.string(),
  updatedAt: v.string(),
});

const one = (description: string) => ({
  200: {
    description,
    content: { "application/json": { schema: resolver(announcementSchema) } },
  },
});

const many = (description: string) => ({
  200: {
    description,
    content: {
      "application/json": { schema: resolver(v.array(announcementSchema)) },
    },
  },
});

const inputSchema = v.object({
  title: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
  content: v.optional(v.pipe(v.string(), v.maxLength(20_000)), ""),
  pinned: v.optional(v.boolean(), false),
  pinnedUntil: v.optional(v.nullable(v.pipe(v.string(), v.isoTimestamp()))),
});

const createSchema = v.object({
  ...inputSchema.entries,
  notify: v.optional(v.boolean(), true),
});

function toInput(body: v.InferOutput<typeof inputSchema>): AnnouncementInput {
  return {
    title: body.title,
    content: body.content,
    pinned: body.pinned,
    // Sin fijar, la fecha de fin no significa nada.
    pinnedUntil:
      body.pinned && body.pinnedUntil ? new Date(body.pinnedUntil) : null,
  };
}

const PUBLISH = {
  project: { project: ["update"] },
  workspace: { workspace: ["manage_settings"] },
};

async function assertCanPublish(c: Context, projectId: string | null) {
  const allowed = await hasWorkspacePermission(
    c,
    projectId ? PUBLISH.project : PUBLISH.workspace,
  );
  if (!allowed) {
    throw new HTTPException(403, { message: "Insufficient permissions" });
  }
}

const announcement = new Hono<{ Variables: Variables }>()
  .get(
    "/workspace/:workspaceId",
    describeRoute({
      operationId: "listWorkspaceAnnouncements",
      tags: ["Announcements"],
      description:
        "The workspace's own announcements (not its projects'): pinned ones first, then newest first, up to 50",
      responses: many("Workspace announcements"),
    }),
    validator("param", v.object({ workspaceId: v.string() })),
    workspaceAccess.fromParam("workspaceId"),
    requireWorkspacePermission({ workspace: ["read"] }),
    async (c) => c.json(await listAnnouncements(c.get("workspaceId"), null)),
  )
  .get(
    "/project/:projectId",
    describeRoute({
      operationId: "listProjectAnnouncements",
      tags: ["Announcements"],
      description:
        "A project's announcements: pinned ones first, then newest first, up to 50",
      responses: many("Project announcements"),
    }),
    validator("param", v.object({ projectId: v.string() })),
    workspaceAccess.fromProject("projectId"),
    requireWorkspacePermission({ project: ["read"] }),
    async (c) => {
      const { projectId } = c.req.valid("param");
      return c.json(await listAnnouncements(c.get("workspaceId"), projectId));
    },
  )
  .get(
    "/project/:projectId/pinned",
    describeRoute({
      operationId: "getPinnedAnnouncement",
      tags: ["Announcements"],
      description:
        "The banner of a project's views: its most recent pinned announcement still in force, or the workspace's, or null",
      responses: {
        200: {
          description: "The pinned announcement, or null",
          content: {
            "application/json": {
              schema: resolver(v.nullable(announcementSchema)),
            },
          },
        },
      },
    }),
    validator("param", v.object({ projectId: v.string() })),
    workspaceAccess.fromProject("projectId"),
    requireWorkspacePermission({ project: ["read"] }),
    async (c) => {
      const { projectId } = c.req.valid("param");
      return c.json(await pinnedForProject(c.get("workspaceId"), projectId));
    },
  )
  .post(
    "/workspace/:workspaceId",
    describeRoute({
      operationId: "createWorkspaceAnnouncement",
      tags: ["Announcements"],
      description:
        "Publish a workspace announcement. Needs workspace:manage_settings. With `notify` (the default) every member but you gets a notification",
      responses: one("The announcement"),
    }),
    validator("param", v.object({ workspaceId: v.string() })),
    validator("json", createSchema),
    workspaceAccess.fromParam("workspaceId"),
    async (c) => {
      await assertCanPublish(c, null);
      const body = c.req.valid("json");
      return c.json(
        await createAnnouncement({
          workspaceId: c.get("workspaceId"),
          projectId: null,
          authorId: c.get("userId"),
          input: toInput(body),
          notify: body.notify,
        }),
      );
    },
  )
  .post(
    "/project/:projectId",
    describeRoute({
      operationId: "createProjectAnnouncement",
      tags: ["Announcements"],
      description:
        "Publish a project announcement. Needs project:update; a personal project has none. With `notify` (the default) every workspace member but you gets a notification",
      responses: one("The announcement"),
    }),
    validator("param", v.object({ projectId: v.string() })),
    validator("json", createSchema),
    workspaceAccess.fromProject("projectId"),
    async (c) => {
      const { projectId } = c.req.valid("param");
      await assertCanPublish(c, projectId);
      await assertAnnounceableProject(c.get("workspaceId"), projectId);
      const body = c.req.valid("json");
      return c.json(
        await createAnnouncement({
          workspaceId: c.get("workspaceId"),
          projectId,
          authorId: c.get("userId"),
          input: toInput(body),
          notify: body.notify,
        }),
      );
    },
  )
  .put(
    "/:id",
    describeRoute({
      operationId: "updateAnnouncement",
      tags: ["Announcements"],
      description:
        "Edit an announcement: its text, and whether and until when it is pinned. Does not notify again",
      responses: one("The announcement"),
    }),
    validator("param", v.object({ id: v.string() })),
    validator("json", inputSchema),
    workspaceAccess.fromAnnouncement("id"),
    async (c) => {
      const { id } = c.req.valid("param");
      const scope = await getAnnouncementScope(id);
      await assertCanPublish(c, scope.projectId);
      return c.json(await updateAnnouncement(id, toInput(c.req.valid("json"))));
    },
  )
  .delete(
    "/:id",
    describeRoute({
      operationId: "deleteAnnouncement",
      tags: ["Announcements"],
      description: "Delete an announcement",
      responses: {
        200: {
          description: "Deleted",
          content: {
            "application/json": {
              schema: resolver(v.object({ success: v.boolean() })),
            },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    workspaceAccess.fromAnnouncement("id"),
    async (c) => {
      const { id } = c.req.valid("param");
      const scope = await getAnnouncementScope(id);
      await assertCanPublish(c, scope.projectId);
      await deleteAnnouncement(id);
      return c.json({ success: true });
    },
  );

export default announcement;
