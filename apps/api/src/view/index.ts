import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import createView from "./controllers/create-view";
import deleteView from "./controllers/delete-view";
import getViews from "./controllers/get-views";
import updateView from "./controllers/update-view";
import { requireViewOwner } from "./require-view-owner";

// Las vistas se gobiernan por propiedad y no por el vocabulario de permisos:
// cualquiera del espacio puede guardarse una y compartirla, y solo su dueno
// —o un administrador— la cambia. Una vista no toca ninguna tarea, solo dice
// como mirarlas. Ver la ADR 015.

const viewTypeSchema = v.picklist([
  "table",
  "board",
  "list",
  "calendar",
  "gantt",
]);

const configSchema = v.record(v.string(), v.unknown());

const view = new Hono<{
  Variables: {
    userId: string;
    workspaceId: string;
  };
}>()
  .get(
    "/project/:projectId",
    describeRoute({
      operationId: "listProjectViews",
      tags: ["Views"],
      description:
        "List the saved views available in a project: the caller's own plus the shared ones",
      responses: {
        200: {
          description: "Views ordered by position",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
      },
    }),
    validator("param", v.object({ projectId: v.string() })),
    validator(
      "query",
      v.optional(v.object({ type: v.optional(viewTypeSchema) })),
    ),
    workspaceAccess.fromProject("projectId"),
    async (c) => {
      const { projectId } = c.req.valid("param");

      return c.json(
        await getViews({
          workspaceId: c.get("workspaceId"),
          projectId,
          userId: c.get("userId"),
          type: c.req.query("type"),
        }),
      );
    },
  )
  .post(
    "/project/:projectId",
    describeRoute({
      operationId: "createProjectView",
      tags: ["Views"],
      description: "Save a view inside a project",
      responses: {
        200: {
          description: "View created successfully",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
      },
    }),
    validator("param", v.object({ projectId: v.string() })),
    validator(
      "json",
      v.object({
        name: v.pipe(v.string(), v.minLength(1), v.maxLength(120)),
        type: viewTypeSchema,
        config: v.optional(configSchema),
        isShared: v.optional(v.boolean()),
      }),
    ),
    workspaceAccess.fromProject("projectId"),
    async (c) => {
      const { projectId } = c.req.valid("param");
      const body = c.req.valid("json");

      return c.json(
        await createView({
          workspaceId: c.get("workspaceId"),
          projectId,
          name: body.name,
          type: body.type,
          config: body.config,
          isShared: body.isShared,
          currentUserId: c.get("userId"),
        }),
      );
    },
  )
  .patch(
    "/:id",
    describeRoute({
      operationId: "updateView",
      tags: ["Views"],
      description:
        "Update, share or archive a saved view. Its type never changes.",
      responses: {
        200: {
          description: "View updated successfully",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator(
      "json",
      v.object({
        name: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(120))),
        config: v.optional(configSchema),
        isShared: v.optional(v.boolean()),
        position: v.optional(v.number()),
        archived: v.optional(v.boolean()),
      }),
    ),
    workspaceAccess.fromView("id"),
    requireViewOwner,
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");

      return c.json(
        await updateView({
          id,
          name: body.name,
          config: body.config,
          isShared: body.isShared,
          position: body.position,
          archived: body.archived,
        }),
      );
    },
  )
  .delete(
    "/:id",
    describeRoute({
      operationId: "deleteView",
      tags: ["Views"],
      description: "Delete a saved view",
      responses: {
        200: {
          description: "View deleted successfully",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    workspaceAccess.fromView("id"),
    requireViewOwner,
    async (c) => {
      const { id } = c.req.valid("param");
      return c.json(await deleteView(id));
    },
  );

export default view;
