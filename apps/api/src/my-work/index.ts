import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import { requireApiKeyScope } from "../utils/require-workspace-permission";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import { parseFilterParam } from "../view/filter-schema";
import { FilterError, type FilterNode } from "../view/filter-to-sql";
import { getWorkspaceFieldRegistry } from "../view/workspace-registry";
import getMyWork from "./controllers/get-my-work";
import searchTasks, {
  SEARCH_SORT_FIELDS,
  type SearchSortField,
} from "./controllers/search-tasks";

const myWorkTaskSchema = v.object({
  id: v.string(),
  number: v.number(),
  title: v.string(),
  status: v.string(),
  priority: v.string(),
  startDate: v.nullable(v.date()),
  dueDate: v.nullable(v.date()),
  createdAt: v.date(),
  userId: v.nullable(v.string()),
  parentId: v.nullable(v.string()),
  depth: v.number(),
  projectId: v.string(),
  projectName: v.string(),
  projectSlug: v.string(),
  projectIcon: v.nullable(v.string()),
  teamId: v.nullable(v.string()),
  teamName: v.nullable(v.string()),
  statusColumn: v.nullable(
    v.object({
      slug: v.string(),
      name: v.string(),
      icon: v.nullable(v.string()),
      isFinal: v.boolean(),
    }),
  ),
  isDone: v.boolean(),
  labels: v.array(
    v.object({ id: v.string(), name: v.string(), color: v.string() }),
  ),
  assignees: v.array(
    v.object({
      id: v.string(),
      name: v.string(),
      image: v.nullable(v.string()),
    }),
  ),
});

const myWorkResponseSchema = v.object({
  tasks: v.array(myWorkTaskSchema),
  pagination: v.object({
    page: v.number(),
    pageSize: v.number(),
    hasMore: v.boolean(),
    /** Numero de filas que casan el filtro, topado en 500. */
    total: v.number(),
    /** Cierto cuando hay mas de 500: `total` es entonces el tope, no el numero real. */
    totalIsCapped: v.boolean(),
  }),
});

const searchTaskSchema = v.object({
  id: v.string(),
  number: v.number(),
  title: v.string(),
  status: v.string(),
  priority: v.string(),
  estimate: v.nullable(v.number()),
  startDate: v.nullable(v.date()),
  dueDate: v.nullable(v.date()),
  createdAt: v.date(),
  updatedAt: v.date(),
  userId: v.nullable(v.string()),
  projectId: v.string(),
  projectName: v.string(),
  projectSlug: v.string(),
  projectIcon: v.nullable(v.string()),
  teamId: v.nullable(v.string()),
  teamName: v.nullable(v.string()),
  statusColumn: v.nullable(
    v.object({
      slug: v.string(),
      name: v.string(),
      icon: v.nullable(v.string()),
      isFinal: v.boolean(),
    }),
  ),
  isDone: v.boolean(),
  labels: v.array(
    v.object({ id: v.string(), name: v.string(), color: v.string() }),
  ),
  assignees: v.array(
    v.object({
      id: v.string(),
      name: v.string(),
      image: v.nullable(v.string()),
    }),
  ),
});

const searchResponseSchema = v.object({
  tasks: v.array(searchTaskSchema),
  pagination: myWorkResponseSchema.entries.pagination,
});

/**
 * "Mi trabajo": la unica lectura de tareas de Riuna que cruza proyectos.
 *
 * Vive en su propio modulo y no como una ruta mas de `task/`, donde las treinta
 * rutas son por proyecto (`workspaceAccess.fromProject` / `fromTask`). El
 * precedente es `search`, que tambien lee entre proyectos y tambien es su
 * propio modulo.
 *
 * Se protege con `requireApiKeyScope` y no con `requireWorkspacePermission`.
 * Un gate de rol seria mas estricto que el hermano al que imita
 * —`GET /task/tasks/:projectId` no lleva ninguno—, asi que un `workspace_role`
 * a medida sin `task:read` veria el tablero y un 403 aqui. Pero sin ningun gate
 * se apagaria de paso la unica comprobacion del alcance de las claves de API, y
 * una clave emitida para un script de informes podria enumerar los titulos de
 * todos los proyectos del espacio.
 */
const myWork = new Hono<{
  Variables: {
    userId: string;
    workspaceId: string;
  };
}>()
  .get(
    "/tasks",
    describeRoute({
      operationId: "listMyWork",
      tags: ["My work"],
      description:
        "List the current user's tasks across every project of a workspace, either assigned to them or to one of their teams",
      responses: {
        200: {
          description:
            "A page of the user's tasks. `pagination.total` counts the matching rows up to 500; above that it returns 500 with `totalIsCapped` set",
          content: {
            "application/json": { schema: resolver(myWorkResponseSchema) },
          },
        },
      },
    }),
    validator(
      "query",
      v.object({
        workspaceId: v.pipe(v.string(), v.minLength(1)),
        scope: v.picklist(["assigned", "team"]),
        includeDone: v.optional(v.picklist(["true", "false"]), "false"),
        due: v.optional(v.picklist(["all", "overdue", "today", "week"]), "all"),
        projectId: v.optional(v.string()),
        page: v.optional(
          v.pipe(
            v.string(),
            v.transform(Number),
            v.number(),
            v.integer("Page must be an integer"),
            v.minValue(1, "Page must be at least 1"),
          ),
          "1",
        ),
        limit: v.optional(
          v.pipe(
            v.string(),
            v.transform(Number),
            v.number(),
            v.integer("Limit must be an integer"),
            v.minValue(1, "Limit must be at least 1"),
            v.maxValue(100, "Limit must not exceed 100"),
          ),
          "50",
        ),
      }),
    ),
    workspaceAccess.fromQuery(),
    requireApiKeyScope({ task: ["read"] }),
    async (c) => {
      const { workspaceId, scope, includeDone, due, projectId, page, limit } =
        c.req.valid("query");

      const result = await getMyWork({
        workspaceId,
        userId: c.get("userId"),
        scope,
        includeDone: includeDone === "true",
        due,
        projectId,
        page,
        limit,
      });

      return c.json(result);
    },
  )
  .get(
    "/tasks/search",
    describeRoute({
      operationId: "searchMyWork",
      tags: ["My work"],
      description:
        "Search the current user's tasks across every project of a workspace with the view filter engine, paginated and sorted",
      responses: {
        200: {
          description:
            "A page of matching tasks. `pagination.total` counts the matching rows up to 500; above that it returns 500 with `totalIsCapped` set",
          content: {
            "application/json": { schema: resolver(searchResponseSchema) },
          },
        },
        400: {
          description:
            "The filter is not valid JSON, has an unexpected shape, or names a field the workspace registry does not offer",
        },
      },
    }),
    validator(
      "query",
      v.object({
        workspaceId: v.pipe(v.string(), v.minLength(1)),
        scope: v.picklist(["assigned", "team"]),
        projectId: v.optional(v.string()),
        /** El arbol del motor de filtros (ADR 014), como JSON en la URL. */
        filter: v.optional(v.string()),
        includeDone: v.optional(v.picklist(["true", "false"]), "false"),
        sortBy: v.optional(v.picklist(SEARCH_SORT_FIELDS), "smart"),
        sortOrder: v.optional(v.picklist(["asc", "desc"]), "asc"),
        page: v.optional(
          v.pipe(
            v.string(),
            v.transform(Number),
            v.number(),
            v.integer("Page must be an integer"),
            v.minValue(1, "Page must be at least 1"),
          ),
          "1",
        ),
        limit: v.optional(
          v.pipe(
            v.string(),
            v.transform(Number),
            v.number(),
            v.integer("Limit must be an integer"),
            v.minValue(1, "Limit must be at least 1"),
            v.maxValue(100, "Limit must not exceed 100"),
          ),
          "50",
        ),
      }),
    ),
    workspaceAccess.fromQuery(),
    requireApiKeyScope({ task: ["read"] }),
    async (c) => {
      const query = c.req.valid("query");

      // Un filtro mal formado o que nombre un campo inexistente es culpa de quien
      // lo manda, no del servidor: 400 y no 500.
      let filter: FilterNode | null = null;
      try {
        filter = parseFilterParam(query.filter);
      } catch (error) {
        throw new HTTPException(400, {
          message: error instanceof Error ? error.message : "Invalid filter",
        });
      }

      // El registro del espacio, no el de un proyecto: retira `status`, `column`,
      // `number`, `position`, `parent` y `depth`, y los campos personalizados que
      // algun proyecto redefine con otro tipo. Ver `buildWorkspaceFieldRegistry`.
      const registry = await getWorkspaceFieldRegistry(query.workspaceId);

      try {
        const result = await searchTasks({
          workspaceId: query.workspaceId,
          userId: c.get("userId"),
          scope: query.scope,
          projectId: query.projectId,
          filter,
          registry,
          includeDone: query.includeDone === "true",
          sortBy: query.sortBy as SearchSortField,
          sortOrder: query.sortOrder,
          page: query.page,
          limit: query.limit,
        });

        return c.json(result);
      } catch (error) {
        // `filterToSql` no compila hasta que se le da el registro, asi que un
        // campo desconocido se descubre aqui y no en el analisis de la URL.
        if (error instanceof FilterError) {
          throw new HTTPException(400, { message: error.message });
        }
        throw error;
      }
    },
  );

export default myWork;
