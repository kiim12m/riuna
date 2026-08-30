import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import { requireApiKeyScope } from "../utils/require-workspace-permission";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import createView from "./controllers/create-view";
import deleteView from "./controllers/delete-view";
import getViews from "./controllers/get-views";
import updateView from "./controllers/update-view";
import { FILTER_OPERATORS } from "./filter-schema";
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

// El `config` de una vista es lo que la barra de filtros tiene en pantalla
// (ADR 015), no un saco libre: una lista de condiciones en edicion mas el modo
// de jerarquia. Ojo, **no** es el `FilterNode` que viaja en la URL: eso es la
// forma compilada, y lo que se guarda es la editable.
//
// Validarlo aqui y no solo al aplicarlo evita guardar —y **compartir**— una
// vista que el motor rechazara despues con un 400, dejando la pantalla en
// blanco a todo el equipo con el fallo descubierto en el consumidor y no en el
// productor. Y acota el tamano: `v.record(v.string(), v.unknown())` aceptaba un
// config de 20 MB que `getViews` devolvia luego a cada miembro del espacio.
const conditionSchema = v.object({
  id: v.pipe(v.string(), v.maxLength(120)),
  field: v.pipe(v.string(), v.minLength(1), v.maxLength(120)),
  operator: v.picklist(FILTER_OPERATORS),
  value: v.optional(v.unknown()),
});

const configSchema = v.object({
  filter: v.optional(v.pipe(v.array(conditionSchema), v.maxLength(50))),
  treeMode: v.optional(
    v.picklist(["tree", "flat", "roots", "withDescendants"]),
  ),
});

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
    // Guardar una vista compartida cambia lo que ve el espacio entero en ese
    // proyecto, asi que una clave de API de solo lectura no debe poder.
    requireApiKeyScope({ project: ["update"] }),
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
    requireApiKeyScope({ project: ["update"] }),
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
    requireApiKeyScope({ project: ["update"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      return c.json(await deleteView(id));
    },
  );

export default view;
