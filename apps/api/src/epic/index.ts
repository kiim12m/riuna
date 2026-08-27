import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import { requireWorkspacePermission } from "../utils/require-workspace-permission";
import { validateAndParseDate } from "../utils/validate-dates";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import createEpic from "./controllers/create-epic";
import deleteEpic from "./controllers/delete-epic";
import getEpics from "./controllers/get-epics";
import updateEpic from "./controllers/update-epic";
import updateTaskEpics from "./controllers/update-task-epics";

// Las epicas viven dentro de un proyecto y se gobiernan con el permiso del
// proyecto: quien puede cambiar sus columnas puede cambiar sus epicas.
// Colgar una tarea de una epica, en cambio, es editar la tarea.
const epicPayload = v.object({
  name: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(120))),
  description: v.optional(v.nullable(v.string())),
  color: v.optional(v.nullable(v.string())),
  startDate: v.optional(v.nullable(v.string())),
  dueDate: v.optional(v.nullable(v.string())),
  archived: v.optional(v.boolean()),
});

function parseOptionalDate(value: string | null | undefined, field: string) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return validateAndParseDate(value, field);
}

const epic = new Hono<{
  Variables: {
    userId: string;
    workspaceId: string;
  };
}>()
  .get(
    "/project/:projectId",
    describeRoute({
      operationId: "listEpics",
      tags: ["Epics"],
      description: "List the epics of a project with their task counts",
      responses: {
        200: {
          description: "Epics ordered by position",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
      },
    }),
    validator("param", v.object({ projectId: v.string() })),
    validator(
      "query",
      v.optional(v.object({ includeArchived: v.optional(v.string()) })),
    ),
    workspaceAccess.fromProject("projectId"),
    async (c) => {
      const { projectId } = c.req.valid("param");
      const includeArchived = c.req.query("includeArchived") === "true";
      return c.json(await getEpics(projectId, includeArchived));
    },
  )
  .post(
    "/project/:projectId",
    describeRoute({
      operationId: "createEpic",
      tags: ["Epics"],
      description: "Create an epic inside a project",
      responses: {
        200: {
          description: "Epic created successfully",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
      },
    }),
    validator("param", v.object({ projectId: v.string() })),
    validator(
      "json",
      v.object({
        name: v.pipe(v.string(), v.minLength(1), v.maxLength(120)),
        description: v.optional(v.nullable(v.string())),
        color: v.optional(v.nullable(v.string())),
        startDate: v.optional(v.nullable(v.string())),
        dueDate: v.optional(v.nullable(v.string())),
      }),
    ),
    workspaceAccess.fromProject("projectId"),
    requireWorkspacePermission({ project: ["update"] }),
    async (c) => {
      const { projectId } = c.req.valid("param");
      const body = c.req.valid("json");

      return c.json(
        await createEpic({
          projectId,
          name: body.name,
          description: body.description,
          color: body.color,
          startDate: parseOptionalDate(body.startDate, "startDate"),
          dueDate: parseOptionalDate(body.dueDate, "dueDate"),
          currentUserId: c.get("userId"),
        }),
      );
    },
  )
  .patch(
    "/:id",
    describeRoute({
      operationId: "updateEpic",
      tags: ["Epics"],
      description: "Update or archive an epic",
      responses: {
        200: {
          description: "Epic updated successfully",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator("json", epicPayload),
    workspaceAccess.fromEpic("id"),
    requireWorkspacePermission({ project: ["update"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");

      return c.json(
        await updateEpic({
          epicId: id,
          name: body.name,
          description: body.description,
          color: body.color,
          startDate: parseOptionalDate(body.startDate, "startDate"),
          dueDate: parseOptionalDate(body.dueDate, "dueDate"),
          archived: body.archived,
          currentUserId: c.get("userId"),
        }),
      );
    },
  )
  .delete(
    "/:id",
    describeRoute({
      operationId: "deleteEpic",
      tags: ["Epics"],
      description: "Delete an epic; its tasks are kept",
      responses: {
        200: {
          description: "Epic deleted successfully",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    workspaceAccess.fromEpic("id"),
    requireWorkspacePermission({ project: ["update"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      return c.json(await deleteEpic(id, c.get("userId")));
    },
  )
  .put(
    "/task/:taskId",
    describeRoute({
      operationId: "updateTaskEpics",
      tags: ["Epics"],
      description: "Replace the set of epics a task belongs to",
      responses: {
        200: {
          description: "Task epics updated successfully",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
      },
    }),
    validator("param", v.object({ taskId: v.string() })),
    validator("json", v.object({ epicIds: v.array(v.string()) })),
    workspaceAccess.fromTask("taskId"),
    requireWorkspacePermission({ task: ["update"] }),
    async (c) => {
      const { taskId } = c.req.valid("param");
      const { epicIds } = c.req.valid("json");

      return c.json(
        await updateTaskEpics({
          taskId,
          epicIds,
          currentUserId: c.get("userId"),
        }),
      );
    },
  );

export default epic;
