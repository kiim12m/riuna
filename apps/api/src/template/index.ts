import { asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import db from "../database";
import { templateTable } from "../database/schema";
import { requireWorkspacePermission } from "../utils/require-workspace-permission";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import {
  applyTaskTemplate,
  templateTaskCount,
} from "./controllers/apply-template";
import {
  captureProjectTemplate,
  captureTaskTemplate,
} from "./controllers/capture-template";

const nameField = v.pipe(v.string(), v.minLength(1), v.maxLength(120));

/**
 * Las plantillas viven en el espacio de trabajo, pero se crean y se aplican
 * desde un proyecto, asi que el permiso que las gobierna es `project:update`:
 * quien puede cambiar un proyecto puede guardarlo como plantilla y desplegar
 * una dentro.
 */
const template = new Hono<{
  Variables: {
    userId: string;
    workspaceId: string;
  };
}>()
  .get(
    "/workspace/:workspaceId",
    describeRoute({
      operationId: "listTemplates",
      tags: ["Templates"],
      description: "List the templates of a workspace",
      responses: {
        200: {
          description: "Templates ordered by name",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
      },
    }),
    validator("param", v.object({ workspaceId: v.string() })),
    workspaceAccess.fromParam("workspaceId"),
    async (c) => {
      const { workspaceId } = c.req.valid("param");

      const rows = await db
        .select()
        .from(templateTable)
        .where(eq(templateTable.workspaceId, workspaceId))
        .orderBy(asc(templateTable.name));

      return c.json(
        rows.map((row) => ({
          id: row.id,
          workspaceId: row.workspaceId,
          name: row.name,
          description: row.description,
          kind: row.kind,
          createdAt: row.createdAt,
          taskCount: templateTaskCount(row.content),
        })),
      );
    },
  )
  .post(
    "/from-task/:taskId",
    describeRoute({
      operationId: "captureTaskTemplate",
      tags: ["Templates"],
      description: "Save a task and everything under it as a template",
      responses: {
        200: {
          description: "Template created successfully",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
      },
    }),
    validator("param", v.object({ taskId: v.string() })),
    validator(
      "json",
      v.object({
        name: nameField,
        description: v.optional(v.nullable(v.string())),
      }),
    ),
    workspaceAccess.fromTask("taskId"),
    requireWorkspacePermission({ project: ["update"] }),
    async (c) => {
      const { taskId } = c.req.valid("param");
      const body = c.req.valid("json");

      return c.json(
        await captureTaskTemplate({
          taskId,
          name: body.name,
          description: body.description,
          currentUserId: c.get("userId"),
        }),
      );
    },
  )
  .post(
    "/from-project/:projectId",
    describeRoute({
      operationId: "captureProjectTemplate",
      tags: ["Templates"],
      description: "Save a project — columns, epics and tasks — as a template",
      responses: {
        200: {
          description: "Template created successfully",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
      },
    }),
    validator("param", v.object({ projectId: v.string() })),
    validator(
      "json",
      v.object({
        name: nameField,
        description: v.optional(v.nullable(v.string())),
      }),
    ),
    workspaceAccess.fromProject("projectId"),
    requireWorkspacePermission({ project: ["update"] }),
    async (c) => {
      const { projectId } = c.req.valid("param");
      const body = c.req.valid("json");

      return c.json(
        await captureProjectTemplate({
          projectId,
          name: body.name,
          description: body.description,
          currentUserId: c.get("userId"),
        }),
      );
    },
  )
  .post(
    "/:id/apply",
    describeRoute({
      operationId: "applyTemplate",
      tags: ["Templates"],
      description:
        "Deploy a template into a project, optionally under an existing task",
      responses: {
        200: {
          description: "Template applied successfully",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator(
      "json",
      v.object({
        projectId: v.pipe(v.string(), v.minLength(1)),
        parentId: v.optional(v.nullable(v.string())),
      }),
    ),
    // `fromProject` lee el id del cuerpo cuando no hay parametro con ese
    // nombre, que es justo este caso.
    workspaceAccess.fromProject("projectId"),
    requireWorkspacePermission({ project: ["update"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");

      return c.json(
        await applyTaskTemplate({
          templateId: id,
          projectId: body.projectId,
          parentId: body.parentId,
          currentUserId: c.get("userId"),
        }),
      );
    },
  )
  .delete(
    "/:id",
    describeRoute({
      operationId: "deleteTemplate",
      tags: ["Templates"],
      description: "Delete a template; what it already created is kept",
      responses: {
        200: {
          description: "Template deleted successfully",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    workspaceAccess.fromTemplate("id"),
    requireWorkspacePermission({ project: ["update"] }),
    async (c) => {
      const { id } = c.req.valid("param");

      const [deleted] = await db
        .delete(templateTable)
        .where(eq(templateTable.id, id))
        .returning();

      if (!deleted) {
        throw new HTTPException(404, { message: "Template not found" });
      }

      return c.json(deleted);
    },
  );

export default template;
