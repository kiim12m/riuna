import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import { getProjectFieldRegistry } from "../project/portfolio-registry";
import { requireWorkspacePermission } from "../utils/require-workspace-permission";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import { getWorkspaceFieldRegistry } from "../view/workspace-registry";
import createFieldDefinition from "./controllers/create-field-definition";
import deleteFieldDefinition from "./controllers/delete-field-definition";
import {
  getFieldDefinitionsForProject,
  getWorkspaceFieldDefinitions,
} from "./controllers/get-field-definitions";
import updateFieldDefinition from "./controllers/update-field-definition";
import { fieldTypeSchema } from "./field-types";
import { requireFieldDefinitionPermission } from "./require-field-definition-permission";

// Los permisos siguen el precedente de las epicas y lo estiran al alcance
// nuevo: un campo de proyecto lo gobierna quien puede cambiar el proyecto
// (`project:update`), y uno de espacio de trabajo quien puede cambiar sus
// ajustes (`workspace:manage_settings`), porque afecta a todos los proyectos
// a la vez. Rellenar el valor de un campo, en cambio, es editar la tarea y va
// con `task:update`, en el modulo de tareas.

// El texto de ayuda de un campo (ADR 090): sale junto a su nombre en el
// detalle, la Tabla y el importador. La columna existia desde la Fase 2 y no la
// ensenaba nadie.
const helpTextSchema = v.optional(
  v.nullable(v.pipe(v.string(), v.maxLength(500))),
);

const definitionPayload = v.object({
  name: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(120))),
  description: helpTextSchema,
  config: v.optional(v.unknown()),
  required: v.optional(v.boolean()),
  position: v.optional(v.number()),
  archived: v.optional(v.boolean()),
});

const field = new Hono<{
  Variables: {
    userId: string;
    workspaceId: string;
  };
}>()
  .get(
    "/project/:projectId",
    describeRoute({
      operationId: "listProjectFieldDefinitions",
      tags: ["Fields"],
      description:
        "List the custom fields that apply to a project: its own plus the workspace-wide ones",
      responses: {
        200: {
          description: "Field definitions ordered by position",
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

      return c.json(
        await getFieldDefinitionsForProject(
          c.get("workspaceId"),
          projectId,
          includeArchived,
        ),
      );
    },
  )
  .get(
    "/workspace/:workspaceId",
    describeRoute({
      operationId: "listWorkspaceFieldDefinitions",
      tags: ["Fields"],
      description:
        "List the workspace-wide custom fields: those of tasks or, with `entity=project`, those of projects. `filterable` says whether a view across projects can filter by a task field: it is false when some project redefines the key with another way of comparing it",
      responses: {
        200: {
          description: "Field definitions ordered by position",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
      },
    }),
    validator("param", v.object({ workspaceId: v.string() })),
    validator(
      "query",
      v.optional(
        v.object({
          includeArchived: v.optional(v.string()),
          entity: v.optional(v.picklist(["task", "project"])),
        }),
      ),
    ),
    workspaceAccess.fromParam("workspaceId"),
    async (c) => {
      const includeArchived = c.req.query("includeArchived") === "true";
      const entity = c.req.query("entity") === "project" ? "project" : "task";

      const workspaceId = c.get("workspaceId");
      const [definitions, registry] = await Promise.all([
        getWorkspaceFieldDefinitions(workspaceId, includeArchived, entity),
        entity === "task"
          ? getWorkspaceFieldRegistry(workspaceId)
          : getProjectFieldRegistry(workspaceId),
      ]);

      // Lo que ofrece la interfaz para filtrar y lo que acepta el servidor tiene
      // que ser lo mismo: un campo que un proyecto redefine con otra forma de
      // comparacion el registro lo retira, y ofrecerlo acabaria en un 400.
      return c.json(
        definitions.map((definition) => ({
          ...definition,
          filterable: `custom.${definition.key}` in registry,
        })),
      );
    },
  )
  .post(
    "/project/:projectId",
    describeRoute({
      operationId: "createProjectFieldDefinition",
      tags: ["Fields"],
      description:
        'Define a custom field inside a project. `description` is its help text. A `formula` field is calculated: `config.expression` reads number, currency and other calculated fields by name between braces ({Budget}), the branch estimate and logged time in hours ({Estimate}, {Logged}), with + - * /, min(), max() and si(condition; then; else); `config.format` is "number", "currency" (with `config.currency`) or "percent". It is stored with keys instead of names, and its value cannot be written',
      responses: {
        200: {
          description: "Field definition created successfully",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
      },
    }),
    validator("param", v.object({ projectId: v.string() })),
    validator(
      "json",
      v.object({
        name: v.pipe(v.string(), v.minLength(1), v.maxLength(120)),
        type: fieldTypeSchema,
        description: helpTextSchema,
        config: v.optional(v.unknown()),
        required: v.optional(v.boolean()),
      }),
    ),
    workspaceAccess.fromProject("projectId"),
    requireWorkspacePermission({ project: ["update"] }),
    async (c) => {
      const { projectId } = c.req.valid("param");
      const body = c.req.valid("json");

      return c.json(
        await createFieldDefinition({
          workspaceId: c.get("workspaceId"),
          projectId,
          name: body.name,
          type: body.type,
          description: body.description,
          config: body.config,
          required: body.required,
          currentUserId: c.get("userId"),
        }),
      );
    },
  )
  .post(
    "/workspace/:workspaceId",
    describeRoute({
      operationId: "createWorkspaceFieldDefinition",
      tags: ["Fields"],
      description:
        'Define a custom field for every project in the workspace at once: a field of their tasks or, with `entity: "project"`, a field of the projects themselves (ADR 088), which cannot be a relation nor calculated. A `formula` field reads only workspace fields; see the project route for its syntax',
      responses: {
        200: {
          description: "Field definition created successfully",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
      },
    }),
    validator("param", v.object({ workspaceId: v.string() })),
    validator(
      "json",
      v.object({
        name: v.pipe(v.string(), v.minLength(1), v.maxLength(120)),
        type: fieldTypeSchema,
        description: helpTextSchema,
        config: v.optional(v.unknown()),
        required: v.optional(v.boolean()),
        entity: v.optional(v.picklist(["task", "project"])),
      }),
    ),
    workspaceAccess.fromParam("workspaceId"),
    requireWorkspacePermission({ workspace: ["manage_settings"] }),
    async (c) => {
      const body = c.req.valid("json");

      return c.json(
        await createFieldDefinition({
          workspaceId: c.get("workspaceId"),
          projectId: null,
          name: body.name,
          type: body.type,
          description: body.description,
          config: body.config,
          required: body.required,
          entity: body.entity,
          currentUserId: c.get("userId"),
        }),
      );
    },
  )
  .patch(
    "/:id",
    describeRoute({
      operationId: "updateFieldDefinition",
      tags: ["Fields"],
      description:
        "Update or archive a custom field. Its type and key never change. A field that a calculated field reads cannot be archived (409)",
      responses: {
        200: {
          description: "Field definition updated successfully",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator("json", definitionPayload),
    workspaceAccess.fromFieldDefinition("id"),
    requireFieldDefinitionPermission,
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");

      return c.json(
        await updateFieldDefinition({
          id,
          name: body.name,
          description: body.description,
          config: body.config,
          required: body.required,
          position: body.position,
          archived: body.archived,
          currentUserId: c.get("userId"),
        }),
      );
    },
  )
  .delete(
    "/:id",
    describeRoute({
      operationId: "deleteFieldDefinition",
      tags: ["Fields"],
      description:
        "Delete a custom field and the values the tasks had stored for it. A field that a calculated field reads cannot be deleted (409)",
      responses: {
        200: {
          description: "Field definition deleted successfully",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    workspaceAccess.fromFieldDefinition("id"),
    requireFieldDefinitionPermission,
    async (c) => {
      const { id } = c.req.valid("param");
      return c.json(await deleteFieldDefinition(id, c.get("userId")));
    },
  );

export default field;
