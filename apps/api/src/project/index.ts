import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import { requireEntitlement } from "../billing/require-entitlement-middleware";
import { projectSchema } from "../schemas";
import { createProjectFromTemplate } from "../template/controllers/create-project-from-template";
import { requireWorkspacePermission } from "../utils/require-workspace-permission";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import archiveProjectCtrl from "./controllers/archive-project";
import createProjectCtrl from "./controllers/create-project";
import deleteProjectCtrl from "./controllers/delete-project";
import getProjectCtrl from "./controllers/get-project";
import getProjectActivity from "./controllers/get-project-activity";
import getProjectsCtrl from "./controllers/get-projects";
import reorderProjectsCtrl from "./controllers/reorder-projects";
import unarchiveProjectCtrl from "./controllers/unarchive-project";
import updateProjectCtrl from "./controllers/update-project";
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
      description: "Get all projects in a workspace",
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
      }),
    ),
    workspaceAccess.fromQuery(),
    async (c) => {
      const workspaceId = c.get("workspaceId");
      const { includeArchived } = c.req.valid("query");
      const projects = await getProjectsCtrl(
        workspaceId,
        includeArchived === "true",
      );
      return c.json(projects);
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
