import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import { requireEntitlement } from "../billing/require-entitlement-middleware";
import { personName } from "../pdf/context";
import { buildPortfolioPdf } from "../pdf/portfolio";
import { pdfResponse } from "../pdf/response";
import { projectSchema } from "../schemas";
import { createProjectFromTemplate } from "../template/controllers/create-project-from-template";
import { buildContentDisposition } from "../utils/content-disposition";
import { requireWorkspacePermission } from "../utils/require-workspace-permission";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import { parseFilterParam } from "../view/filter-schema";
import { FilterError, type FilterNode } from "../view/filter-to-sql";
import archiveProjectCtrl from "./controllers/archive-project";
import createProjectCtrl from "./controllers/create-project";
import deleteProjectCtrl from "./controllers/delete-project";
import exportProjects from "./controllers/export-projects";
import getProjectCtrl from "./controllers/get-project";
import getProjectActivity from "./controllers/get-project-activity";
import getProjectsCtrl from "./controllers/get-projects";
import reorderProjectsCtrl from "./controllers/reorder-projects";
import unarchiveProjectCtrl from "./controllers/unarchive-project";
import updateProjectCtrl from "./controllers/update-project";
import updateProjectCustomFields from "./controllers/update-project-custom-fields";
import updateProjectParent from "./controllers/update-project-parent";
import updateProjectStatus, {
  PROJECT_HEALTHS,
} from "./controllers/update-project-status";
import updateProjectTreeSettings from "./controllers/update-project-tree-settings";
import "./status-events";

// Un dia sin zona (ADR 049), o nada para quitarlo.
const projectDay = v.nullable(v.pipe(v.string(), v.isoTimestamp()));

const project = new Hono<{
  Variables: {
    userId: string;
    workspaceId: string;
  };
}>()
  .get(
    "/",
    describeRoute({
      operationId: "listProjects",
      tags: ["Projects"],
      description:
        "Get all projects in a workspace, with their statistics. `filter` narrows the list with the same filter tree as the task views, over the project's own fields (name, key, health, lead, startDate, endDate, createdAt, progress) and its project fields as `custom.<key>`.",
      responses: {
        200: {
          description: "List of projects with statistics",
          content: {
            "application/json": { schema: resolver(v.array(projectSchema)) },
          },
        },
      },
    }),
    validator(
      "query",
      v.object({
        workspaceId: v.string(),
        includeArchived: v.optional(v.string()),
        // El arbol de filtros de la cartera, como JSON (ADR 088).
        filter: v.optional(v.string()),
      }),
    ),
    workspaceAccess.fromQuery(),
    async (c) => {
      const workspaceId = c.get("workspaceId");
      const { includeArchived, filter: rawFilter } = c.req.valid("query");

      let filter: FilterNode | null = null;
      try {
        filter = parseFilterParam(rawFilter);
      } catch (error) {
        throw new HTTPException(400, {
          message: error instanceof Error ? error.message : "Invalid filter",
        });
      }

      try {
        return c.json(
          await getProjectsCtrl(
            workspaceId,
            includeArchived === "true",
            filter,
          ),
        );
      } catch (error) {
        if (error instanceof FilterError) {
          throw new HTTPException(400, { message: error.message });
        }
        throw error;
      }
    },
  )
  .get(
    "/export",
    describeRoute({
      operationId: "exportProjects",
      tags: ["Projects"],
      description:
        "Export the project list as a spreadsheet (ADR 088): the projects that match `filter`, with their status, dates, progress and one column per project field. With `format=pdf` (ADR 091) it takes the visible `columns` (comma separated ids), a `title` and a `subtitle`.",
      responses: {
        200: {
          description: "Spreadsheet or PDF file",
          content: {
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
              { schema: { type: "string", format: "binary" } },
            "application/pdf": { schema: { type: "string", format: "binary" } },
          },
        },
      },
    }),
    validator(
      "query",
      v.object({
        workspaceId: v.string(),
        filter: v.optional(v.string()),
        format: v.optional(v.picklist(["xlsx", "pdf"]), "xlsx"),
        columns: v.optional(v.pipe(v.string(), v.maxLength(4_000))),
        title: v.optional(v.pipe(v.string(), v.maxLength(200))),
        subtitle: v.optional(v.pipe(v.string(), v.maxLength(500))),
      }),
    ),
    workspaceAccess.fromQuery(),
    async (c) => {
      const query = c.req.valid("query");
      const rawFilter = query.filter;
      let filter: FilterNode | null = null;
      try {
        filter = parseFilterParam(rawFilter);
      } catch (error) {
        throw new HTTPException(400, {
          message: error instanceof Error ? error.message : "Invalid filter",
        });
      }

      if (query.format === "pdf") {
        try {
          const pdf = await buildPortfolioPdf(
            c.get("workspaceId"),
            {
              filter,
              columns: query.columns?.split(",").filter(Boolean),
              title: query.title,
              subtitle: query.subtitle,
            },
            await personName(c.get("userId")),
          );
          return pdfResponse(c, pdf);
        } catch (error) {
          if (error instanceof FilterError) {
            throw new HTTPException(400, { message: error.message });
          }
          throw error;
        }
      }

      let sheet: Awaited<ReturnType<typeof exportProjects>>;
      try {
        sheet = await exportProjects(c.get("workspaceId"), filter);
      } catch (error) {
        if (error instanceof FilterError) {
          throw new HTTPException(400, { message: error.message });
        }
        throw error;
      }

      // Sin Content-Length: el `compress()` global puede recodificar el cuerpo.
      return c.body(new Uint8Array(sheet.buffer), 200, {
        "Content-Disposition": buildContentDisposition(sheet.filename, false),
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "X-Content-Type-Options": "nosniff",
      });
    },
  )
  .post(
    "/",
    describeRoute({
      operationId: "createProject",
      tags: ["Projects"],
      description: "Create a new project in a workspace",
      responses: {
        200: {
          description: "Project created successfully",
          content: {
            "application/json": { schema: resolver(projectSchema) },
          },
        },
      },
    }),
    validator(
      "json",
      v.object({
        name: v.string(),
        workspaceId: v.string(),
        icon: v.string(),
        slug: v.string(),
        // Una plantilla de proyecto del mismo espacio: el proyecto nace con
        // sus columnas, sus epicas y su arbol de tareas (ADR 027).
        templateId: v.optional(v.string()),
      }),
    ),
    workspaceAccess.fromBody(),
    requireWorkspacePermission({ project: ["create"] }),
    requireEntitlement,
    async (c) => {
      const { name, icon, slug, templateId } = c.req.valid("json");
      const workspaceId = c.get("workspaceId");
      const newProject = templateId
        ? await createProjectFromTemplate({
            workspaceId,
            name,
            icon,
            slug,
            templateId,
            currentUserId: c.get("userId"),
          })
        : await createProjectCtrl(workspaceId, name, icon, slug);
      return c.json(newProject);
    },
  )
  .get(
    "/:id",
    describeRoute({
      operationId: "getProject",
      tags: ["Projects"],
      description: "Get a specific project by ID",
      responses: {
        200: {
          description: "Project details",
          content: {
            "application/json": { schema: resolver(projectSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    workspaceAccess.fromProject(),
    async (c) => {
      const { id } = c.req.valid("param");
      const workspaceId = c.get("workspaceId");
      const projectData = await getProjectCtrl(id, workspaceId);
      return c.json(projectData);
    },
  )
  .put(
    "/reorder",
    describeRoute({
      operationId: "reorderProjects",
      tags: ["Projects"],
      description: "Reorder projects in a workspace",
      responses: {
        200: {
          description: "Projects reordered successfully",
          content: {
            "application/json": { schema: resolver(v.array(projectSchema)) },
          },
        },
      },
    }),
    validator("query", v.object({ workspaceId: v.string() })),
    validator(
      "json",
      v.object({
        // Positions express a relative order only; the controller renumbers
        // the workspace to 0..n-1, so the values just have to be sane.
        projects: v.pipe(
          v.array(
            v.object({
              id: v.string(),
              position: v.pipe(v.number(), v.integer(), v.minValue(0)),
            }),
          ),
          v.minLength(1),
        ),
      }),
    ),
    workspaceAccess.fromQuery(),
    requireWorkspacePermission({ project: ["update"] }),
    async (c) => {
      const workspaceId = c.get("workspaceId");
      const { projects } = c.req.valid("json");
      const reordered = await reorderProjectsCtrl(workspaceId, projects);
      return c.json(reordered);
    },
  )
  .put(
    "/:id",
    describeRoute({
      operationId: "updateProject",
      tags: ["Projects"],
      description: "Update an existing project",
      responses: {
        200: {
          description: "Project updated successfully",
          content: {
            "application/json": { schema: resolver(projectSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator(
      "json",
      v.object({
        name: v.string(),
        icon: v.string(),
        slug: v.string(),
        description: v.string(),
        isPublic: v.boolean(),
      }),
    ),
    workspaceAccess.fromProject(),
    requireWorkspacePermission({ project: ["update"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const { name, icon, slug, description, isPublic } = c.req.valid("json");
      const workspaceId = c.get("workspaceId");
      const updatedProject = await updateProjectCtrl(
        id,
        name,
        icon,
        slug,
        description,
        isPublic,
        workspaceId,
      );
      return c.json(updatedProject);
    },
  )
  .patch(
    "/:id/tree-settings",
    describeRoute({
      operationId: "updateProjectTreeSettings",
      tags: ["Projects"],
      description:
        "Update how the task tree behaves in this project: whether closing or archiving cascades down the branch, how deep the tree may go, and whether a branch's progress weighs each task by its estimate.",
      responses: {
        200: {
          description: "Project tree settings updated successfully",
          content: {
            "application/json": { schema: resolver(projectSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator(
      "json",
      v.object({
        cascadeClose: v.optional(v.boolean()),
        cascadeArchive: v.optional(v.boolean()),
        maxTaskDepth: v.optional(
          v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(10)),
        ),
        weightedProgress: v.optional(v.boolean()),
      }),
    ),
    workspaceAccess.fromProject(),
    requireWorkspacePermission({ project: ["update"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      return c.json(
        await updateProjectTreeSettings({ projectId: id, ...body }),
      );
    },
  )
  .patch(
    "/:id/status",
    describeRoute({
      operationId: "updateProjectStatus",
      tags: ["Projects"],
      description:
        "Update a project's status: its health (not started, on track, at risk, off track, finished or cancelled) with a short note, its own start and end dates, and its lead, a member of the workspace. Only what is sent changes, and each change is kept in the project's activity. With `notify`, a change of health is announced to the whole workspace.",
      responses: {
        200: {
          description: "Project status updated",
          content: {
            "application/json": { schema: resolver(projectSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator(
      "json",
      v.object({
        health: v.optional(v.picklist(PROJECT_HEALTHS)),
        note: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(500)))),
        startDate: v.optional(projectDay),
        endDate: v.optional(projectDay),
        leadUserId: v.optional(v.nullable(v.string())),
        notify: v.optional(v.boolean()),
      }),
    ),
    workspaceAccess.fromProject(),
    requireWorkspacePermission({ project: ["update"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const { notify, startDate, endDate, ...rest } = c.req.valid("json");
      const toDate = (value: string | null | undefined) =>
        value === undefined
          ? undefined
          : value === null
            ? null
            : new Date(value);
      return c.json(
        await updateProjectStatus({
          projectId: id,
          workspaceId: c.get("workspaceId"),
          userId: c.get("userId"),
          input: {
            ...rest,
            startDate: toDate(startDate),
            endDate: toDate(endDate),
          },
          notify,
        }),
      );
    },
  )
  .patch(
    "/:id/parent",
    describeRoute({
      operationId: "updateProjectParent",
      tags: ["Projects"],
      description:
        "Make a project a subproject of another, or release it with `parentId: null` (ADR 089). One level only: the parent cannot have a parent and a project with subprojects cannot become one. Personal inboxes take no part.",
      responses: {
        200: {
          description: "Project with its new parent",
          content: {
            "application/json": { schema: resolver(projectSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator("json", v.object({ parentId: v.nullable(v.string()) })),
    workspaceAccess.fromProject(),
    requireWorkspacePermission({ project: ["update"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const { parentId } = c.req.valid("json");
      return c.json(
        await updateProjectParent({
          projectId: id,
          workspaceId: c.get("workspaceId"),
          parentId,
          userId: c.get("userId"),
        }),
      );
    },
  )
  .put(
    "/:id/custom-fields",
    describeRoute({
      operationId: "updateProjectCustomFields",
      tags: ["Projects"],
      description:
        "Write values of the workspace's project fields on a project (ADR 088). `values` is partial: what is not sent is kept, and an empty value clears the key. Each value is validated against its field definition.",
      responses: {
        200: {
          description: "Project with its updated field values",
          content: {
            "application/json": { schema: resolver(projectSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator("json", v.object({ values: v.record(v.string(), v.unknown()) })),
    workspaceAccess.fromProject(),
    requireWorkspacePermission({ project: ["update"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const { values } = c.req.valid("json");
      return c.json(
        await updateProjectCustomFields({
          projectId: id,
          workspaceId: c.get("workspaceId"),
          values,
          userId: c.get("userId"),
        }),
      );
    },
  )
  .get(
    "/:id/activity",
    describeRoute({
      operationId: "getProjectActivity",
      tags: ["Projects"],
      description:
        "The history of a project's status, newest first: changes of health (with their note), of dates and of lead, with who made them.",
      responses: {
        200: {
          description: "Project activity",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    workspaceAccess.fromProject(),
    async (c) => {
      const { id } = c.req.valid("param");
      return c.json(await getProjectActivity(id));
    },
  )
  .delete(
    "/:id",
    describeRoute({
      operationId: "deleteProject",
      tags: ["Projects"],
      description: "Delete a project by ID",
      responses: {
        200: {
          description: "Project deleted successfully",
          content: {
            "application/json": { schema: resolver(projectSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    workspaceAccess.fromProject(),
    requireWorkspacePermission({ project: ["delete"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const workspaceId = c.get("workspaceId");
      const deletedProject = await deleteProjectCtrl(id, workspaceId);
      return c.json(deletedProject);
    },
  )
  .put(
    "/:id/archive",
    describeRoute({
      operationId: "archiveProject",
      tags: ["Projects"],
      description: "Archive a project by ID",
      responses: {
        200: {
          description: "Project archived successfully",
          content: {
            "application/json": { schema: resolver(projectSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    workspaceAccess.fromProject(),
    requireWorkspacePermission({ project: ["update"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const workspaceId = c.get("workspaceId");
      const archivedProject = await archiveProjectCtrl(id, workspaceId);
      return c.json(archivedProject);
    },
  )
  .put(
    "/:id/unarchive",
    describeRoute({
      operationId: "unarchiveProject",
      tags: ["Projects"],
      description: "Unarchive a project by ID",
      responses: {
        200: {
          description: "Project unarchived successfully",
          content: {
            "application/json": { schema: resolver(projectSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    workspaceAccess.fromProject(),
    requireWorkspacePermission({ project: ["update"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const workspaceId = c.get("workspaceId");
      const unarchivedProject = await unarchiveProjectCtrl(id, workspaceId);
      return c.json(unarchivedProject);
    },
  );

export default project;
