import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import { requireApiKeyScope } from "../utils/require-workspace-permission";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import getMyWork from "./controllers/get-my-work";

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
  }),
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
}>().get(
  "/tasks",
  describeRoute({
    operationId: "listMyWork",
    tags: ["My work"],
    description:
      "List the current user's tasks across every project of a workspace, either assigned to them or to one of their teams",
    responses: {
      200: {
        description: "A page of the user's tasks",
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
);

export default myWork;
