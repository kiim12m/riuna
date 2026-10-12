import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import { requireEntitlement } from "../billing/require-entitlement-middleware";
import db from "../database";
import {
  assetTable,
  projectTable,
  taskTable,
  workspaceTable,
} from "../database/schema";
import { buildImportSource } from "../external-ref";
import { taskSchema } from "../schemas";
import {
  assertTaskImageKeyMatchesContext,
  createTaskImageUploadUrl,
  isImageContentType,
  validateTaskAssetUploadInput,
} from "../storage/s3";
import { buildContentDisposition } from "../utils/content-disposition";
import { normalizeApiServerUrl } from "../utils/openapi-spec";
import {
  hasWorkspacePermission,
  requireWorkspacePermission,
} from "../utils/require-workspace-permission";
import {
  validateAndParseDate,
  validateDateRange,
} from "../utils/validate-dates";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import { parseFilterParam } from "../view/filter-schema";
import { FilterError, type FilterNode } from "../view/filter-to-sql";
import analyzeImport from "./controllers/analyze-import";
import { analyzeServitec } from "./controllers/analyze-servitec";
import bulkUpdateTasks from "./controllers/bulk-update-tasks";
import completeTask from "./controllers/complete-task";
import createTask from "./controllers/create-task";
import deleteTask from "./controllers/delete-task";
import exportTaskSheet from "./controllers/export-task-sheet";
import exportTasks from "./controllers/export-tasks";
import exportWorkspaceTasks from "./controllers/export-workspace-tasks";
import getTask from "./controllers/get-task";
import getTasks from "./controllers/get-tasks";
import { importServitec } from "./controllers/import-servitec";
import importTasks from "./controllers/import-tasks";
import moveTask from "./controllers/move-task";
import {
  requireBulkTaskEntitlement,
  requireBulkTaskPermission,
  requireTaskAssigneePermission,
} from "./controllers/require-task-permission";
import updateTask from "./controllers/update-task";
import updateTaskAssignee from "./controllers/update-task-assignee";
import updateTaskAssignees from "./controllers/update-task-assignees";
import updateTaskCustomFields from "./controllers/update-task-custom-fields";
import updateTaskDescription from "./controllers/update-task-description";
import updateTaskDueDate from "./controllers/update-task-due-date";
import updateTaskEstimate from "./controllers/update-task-estimate";
import updateTaskParent from "./controllers/update-task-parent";
import updateTaskPriority from "./controllers/update-task-priority";
import updateTaskStatus from "./controllers/update-task-status";
import updateTaskTeam from "./controllers/update-task-team";
import updateTaskTitle from "./controllers/update-task-title";
import { parseUploadedFile } from "./exchange/parse-file";
import {
  MAX_IMPORT_UPLOAD_BYTES,
  parseMapping,
  readUpload,
  rejectOversized,
} from "./exchange/upload";
import { VALID_PRIORITIES } from "./validate-task-fields";

// Que hacer con cada PROYECTO de la hoja SERVITEC que no existe (ADR 069).
const servitecChoicesSchema = v.record(
  v.pipe(v.string(), v.maxLength(200)),
  v.variant("action", [
    v.object({ action: v.literal("map"), projectId: v.string() }),
    v.object({ action: v.literal("create") }),
    v.object({ action: v.literal("skip") }),
  ]),
);

const task = new Hono<{
  Variables: {
    userId: string;
  };
}>()
  .get(
    "/tasks/:projectId",
    describeRoute({
      operationId: "listTasks",
      tags: ["Tasks"],
      description: "Get all tasks for a specific project",
      responses: {
        200: {
          description: "Project with tasks organized by columns",
          content: {
            "application/json": { schema: resolver(v.any()) },
          },
        },
      },
    }),
    validator("param", v.object({ projectId: v.string() })),
    validator(
      "query",
      v.optional(
        v.object({
          status: v.optional(v.string()),
          priority: v.optional(v.string()),
          assigneeId: v.optional(v.string()),
          epicId: v.optional(v.string()),
          rootsOnly: v.optional(v.string()),
          page: v.optional(v.pipe(v.string(), v.transform(Number))),
          limit: v.optional(v.pipe(v.string(), v.transform(Number))),
          sortBy: v.optional(
            v.picklist([
              "createdAt",
              "priority",
              "dueDate",
              "position",
              "title",
              "number",
            ]),
          ),
          sortOrder: v.optional(v.picklist(["asc", "desc"])),
          dueBefore: v.optional(v.string()),
          dueAfter: v.optional(v.string()),
          // El arbol de filtros del motor de vistas, como JSON. Va en la URL
          // para que una vista guardada siga siendo un enlace.
          filter: v.optional(v.string()),
          // Que hace el filtro con la jerarquia. Ver `GetTasksOptions`.
          treeScope: v.optional(
            v.picklist(["matching", "roots", "withDescendants"]),
          ),
        }),
      ),
    ),
    workspaceAccess.fromProject("projectId"),
    async (c) => {
      const { projectId } = c.req.valid("param");
      const filters = c.req.valid("query") || {};

      // Un filtro mal formado o que nombre un campo inexistente es culpa de
      // quien lo manda, no del servidor: 400 y no 500.
      let filter: FilterNode | null = null;
      try {
        filter = parseFilterParam(filters.filter);
      } catch (error) {
        throw new HTTPException(400, {
          message: error instanceof Error ? error.message : "Invalid filter",
        });
      }

      try {
        const tasks = await getTasks(projectId, {
          ...filters,
          rootsOnly: filters.rootsOnly === "true",
          treeScope: filters.treeScope,
          filter,
        });

        return c.json(tasks);
      } catch (error) {
        if (error instanceof FilterError) {
          throw new HTTPException(400, { message: error.message });
        }
        throw error;
      }
    },
  )
  .patch(
    "/bulk",
    describeRoute({
      operationId: "bulkUpdateTasks",
      tags: ["Tasks"],
      description: "Perform bulk operations on multiple tasks",
      responses: {
        200: {
          description: "Bulk operation completed successfully",
          content: {
            "application/json": {
              schema: resolver(
                v.object({
                  success: v.boolean(),
                  updatedCount: v.number(),
                }),
              ),
            },
          },
        },
      },
    }),
    validator(
      "json",
      v.object({
        taskIds: v.pipe(v.array(v.string()), v.minLength(1)),
        operation: v.picklist([
          "updateStatus",
          "updatePriority",
          "updateAssignee",
          "delete",
          "addLabel",
          "removeLabel",
          "updateDueDate",
        ] as const),
        value: v.optional(v.nullable(v.string())),
      }),
    ),
    workspaceAccess.fromTasks(),
    requireBulkTaskPermission,
    requireBulkTaskEntitlement,
    async (c) => {
      const { taskIds, operation, value } = c.req.valid("json");
      const userId = c.get("userId");

      if (!userId) {
        throw new HTTPException(401, { message: "Unauthorized" });
      }

      if (
        operation !== "delete" &&
        operation !== "updateDueDate" &&
        value === undefined
      ) {
        throw new HTTPException(400, {
          message: "Value is required for this operation",
        });
      }

      const result = await bulkUpdateTasks({
        taskIds,
        operation,
        value,
        userId,
      });

      return c.json(result);
    },
  )
  .post(
    "/:projectId",
    describeRoute({
      operationId: "createTask",
      tags: ["Tasks"],
      description: "Create a new task in a project",
      responses: {
        200: {
          description: "Task created successfully",
          content: {
            "application/json": { schema: resolver(taskSchema) },
          },
        },
      },
    }),
    validator(
      "json",
      v.object({
        title: v.string(),
        description: v.string(),
        startDate: v.optional(v.string()),
        dueDate: v.optional(v.string()),
        priority: v.picklist(VALID_PRIORITIES),
        status: v.string(),
        userId: v.optional(v.string()),
        parentId: v.optional(v.nullable(v.string())),
        estimate: v.optional(v.nullable(v.pipe(v.number(), v.minValue(0)))),
      }),
    ),
    workspaceAccess.fromProject("projectId"),
    requireWorkspacePermission({ task: ["create"] }),
    requireEntitlement,
    async (c) => {
      const { projectId } = c.req.param();
      const {
        title,
        description,
        startDate,
        dueDate,
        priority,
        status,
        userId,
        parentId,
        estimate,
      } = c.req.valid("json");

      const parsedStartDate =
        startDate !== undefined
          ? validateAndParseDate(startDate, "startDate")
          : undefined;
      const parsedDueDate =
        dueDate !== undefined
          ? validateAndParseDate(dueDate, "dueDate")
          : undefined;

      validateDateRange(parsedStartDate, parsedDueDate);

      const task = await createTask({
        projectId,
        currentUserId: c.get("userId"),
        userId: userId,
        title,
        description,
        startDate: parsedStartDate,
        dueDate: parsedDueDate,
        priority,
        status,
        parentId,
        estimate,
        creatorWatches: true,
      });

      return c.json(task);
    },
  )
  .get(
    "/:id",
    describeRoute({
      operationId: "getTask",
      tags: ["Tasks"],
      description: "Get a specific task by ID",
      responses: {
        200: {
          description: "Task details",
          content: {
            "application/json": { schema: resolver(taskSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    workspaceAccess.fromTask(),
    async (c) => {
      const { id } = c.req.valid("param");

      const task = await getTask(id);

      return c.json(task);
    },
  )
  .put(
    "/move/:id",
    describeRoute({
      operationId: "moveTask",
      tags: ["Tasks"],
      description: "Move a task to another project",
      responses: {
        200: {
          description: "Task moved successfully",
          content: {
            "application/json": {
              schema: resolver(
                v.object({
                  task: taskSchema,
                  sourceProjectId: v.string(),
                  destinationProjectId: v.string(),
                }),
              ),
            },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator(
      "json",
      v.object({
        destinationProjectId: v.string(),
        destinationStatus: v.optional(v.string()),
      }),
    ),
    workspaceAccess.fromTask(),
    requireWorkspacePermission({ task: ["update"] }),
    requireEntitlement,
    async (c) => {
      const { id } = c.req.valid("param");
      const { destinationProjectId, destinationStatus } = c.req.valid("json");
      const currentUserId = c.get("userId");

      const result = await moveTask({
        taskId: id,
        destinationProjectId,
        destinationStatus,
        currentUserId,
      });

      return c.json(result);
    },
  )
  .put(
    "/:id",
    describeRoute({
      operationId: "updateTask",
      tags: ["Tasks"],
      description: "Update all fields of a task",
      responses: {
        200: {
          description: "Task updated successfully",
          content: {
            "application/json": { schema: resolver(taskSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator(
      "json",
      v.object({
        title: v.string(),
        description: v.string(),
        startDate: v.optional(v.string()),
        dueDate: v.optional(v.string()),
        priority: v.picklist(VALID_PRIORITIES),
        status: v.string(),
        projectId: v.string(),
        position: v.number(),
        userId: v.optional(v.string()),
      }),
    ),
    workspaceAccess.fromTask(),
    requireWorkspacePermission({ task: ["update"] }),
    requireTaskAssigneePermission,
    requireEntitlement,
    async (c) => {
      const { id } = c.req.valid("param");
      const {
        title,
        description,
        startDate,
        dueDate,
        priority,
        status,
        projectId,
        position,
        userId,
      } = c.req.valid("json");

      const currentUserId = c.get("userId");

      const parsedStartDate =
        startDate !== undefined
          ? validateAndParseDate(startDate, "startDate")
          : undefined;
      const parsedDueDate =
        dueDate !== undefined
          ? validateAndParseDate(dueDate, "dueDate")
          : undefined;

      validateDateRange(parsedStartDate, parsedDueDate);

      const task = await updateTask(
        id,
        title,
        status,
        parsedStartDate,
        parsedDueDate,
        projectId,
        description,
        priority,
        position,
        userId,
        currentUserId,
      );

      return c.json(task);
    },
  )
  .get(
    "/export/:projectId",
    describeRoute({
      operationId: "exportTasks",
      tags: ["Tasks"],
      description: "Export all tasks from a project",
      responses: {
        200: {
          description: "Exported tasks data",
          content: {
            "application/json": { schema: resolver(v.any()) },
          },
        },
      },
    }),
    validator("param", v.object({ projectId: v.string() })),
    validator(
      "query",
      v.object({
        format: v.optional(v.picklist(["json", "csv", "xlsx"])),
        filter: v.optional(v.string()),
        treeScope: v.optional(
          v.picklist(["matching", "roots", "withDescendants"]),
        ),
      }),
    ),
    workspaceAccess.fromProject("projectId"),
    async (c) => {
      const { projectId } = c.req.valid("param");
      const query = c.req.valid("query");

      // `json` sigue siendo el valor por defecto: es lo que devuelve hoy y hay
      // una interfaz colgando de ello.
      if (!query.format || query.format === "json") {
        return c.json(await exportTasks(projectId));
      }

      // Exportar "la vista que estoy mirando" es pasar la misma busqueda que ya
      // vive en la URL. Punto 3 de la ADR 015.
      let filter: FilterNode | null = null;
      try {
        filter = parseFilterParam(query.filter);
      } catch (error) {
        throw new HTTPException(400, {
          message: error instanceof Error ? error.message : "Invalid filter",
        });
      }

      let sheet: Awaited<ReturnType<typeof exportTaskSheet>>;
      try {
        sheet = await exportTaskSheet(projectId, {
          format: query.format,
          filter,
          treeScope: query.treeScope,
        });
      } catch (error) {
        if (error instanceof FilterError) {
          throw new HTTPException(400, { message: error.message });
        }
        throw error;
      }

      // Sin Content-Length: el `compress()` global puede recodificar el cuerpo,
      // y un largo obsoleto es peor que ninguno.
      return c.body(new Uint8Array(sheet.buffer), 200, {
        "Content-Disposition": buildContentDisposition(sheet.filename, false),
        "Content-Type": sheet.contentType,
        "X-Content-Type-Options": "nosniff",
      });
    },
  )
  .get(
    "/export/servitec/:workspaceId",
    describeRoute({
      operationId: "exportWorkspaceTasksXlsx",
      tags: ["Tasks"],
      description:
        "Export every task in a workspace as the SERVITEC spreadsheet board",
      responses: {
        200: {
          description: "Spreadsheet file",
          content: {
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
              { schema: { type: "string", format: "binary" } },
          },
        },
      },
    }),
    validator("param", v.object({ workspaceId: v.string() })),
    workspaceAccess.fromParam("workspaceId"),
    requireWorkspacePermission({ task: ["read"] }),
    async (c) => {
      const { workspaceId } = c.req.valid("param");

      const { buffer, filename } = await exportWorkspaceTasks(workspaceId);

      // No Content-Length: the global compress() middleware may re-encode the
      // body, and a stale length is worse than none.
      return c.body(new Uint8Array(buffer), 200, {
        "Content-Disposition": buildContentDisposition(filename, false),
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "X-Content-Type-Options": "nosniff",
      });
    },
  )
  .post(
    "/import/:projectId/analyze",
    describeRoute({
      operationId: "analyzeTaskImport",
      tags: ["Tasks"],
      description:
        "Read a CSV or spreadsheet and report the columns, the hierarchy and how many rows already exist, without writing anything",
      responses: {
        200: {
          description: "What the importer understood from the file",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
      },
    }),
    // `bodyLimit` va el primero: detras del validador no protege de nada,
    // porque el cuerpo ya se ha leido entero en memoria.
    bodyLimit({ maxSize: MAX_IMPORT_UPLOAD_BYTES, onError: rejectOversized }),
    validator("param", v.object({ projectId: v.string() })),
    validator(
      "form",
      v.object({
        file: v.instance(File),
        source: v.optional(v.string()),
      }),
    ),
    workspaceAccess.fromProject("projectId"),
    requireWorkspacePermission({ task: ["create"] }),
    async (c) => {
      const { projectId } = c.req.valid("param");
      const upload = await readUpload(c);

      const analysis = await analyzeImport({
        projectId,
        buffer: upload.buffer,
        filename: upload.filename,
        source: upload.source,
      });

      return c.json(analysis);
    },
  )
  .post(
    "/import/:projectId",
    describeRoute({
      operationId: "importTasks",
      tags: ["Tasks"],
      description:
        "Import a CSV or spreadsheet into a project, preserving hierarchy and updating rows it has seen before",
      responses: {
        200: {
          description: "What the import did",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
      },
    }),
    bodyLimit({ maxSize: MAX_IMPORT_UPLOAD_BYTES, onError: rejectOversized }),
    validator("param", v.object({ projectId: v.string() })),
    validator(
      "form",
      v.object({
        file: v.instance(File),
        mapping: v.string(),
        source: v.optional(v.string()),
        dryRun: v.optional(v.string()),
      }),
    ),
    workspaceAccess.fromProject("projectId"),
    requireWorkspacePermission({ task: ["create"] }),
    requireEntitlement,
    async (c) => {
      const { projectId } = c.req.valid("param");
      const currentUserId = c.get("userId");
      const upload = await readUpload(c);
      const mapping = parseMapping(upload.mapping);

      // Crear definiciones de campo es cambiar la forma de las tareas de todo
      // el proyecto, y eso lo gobierna `project:update` (ADR 013). Se comprueba
      // aqui y no en el middleware porque depende del cuerpo: importar sin
      // crear campos sigue al alcance de un `member`.
      if (
        mapping.some(
          (column) => column.target.kind === "custom" && column.target.create,
        )
      ) {
        if (!(await hasWorkspacePermission(c, { project: ["update"] }))) {
          throw new HTTPException(403, {
            message:
              "Creating custom fields while importing requires permission to update the project",
          });
        }
      }

      const sheet = await parseUploadedFile(upload.buffer, upload.filename);

      const report = await importTasks({
        projectId,
        currentUserId,
        source: upload.source || buildImportSource(upload.filename),
        rows: sheet.rows,
        mapping,
        dryRun: upload.dryRun,
      });

      return c.json(report);
    },
  )
  .post(
    "/import/servitec/:workspaceId/analyze",
    describeRoute({
      operationId: "analyzeServitecImport",
      tags: ["Tasks"],
      description:
        "Read a SERVITEC sheet without writing anything: how many rows, which are tasks that already exist, and which PROYECTO names match no project",
      responses: {
        200: {
          description: "What the sheet would bring",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
      },
    }),
    bodyLimit({ maxSize: MAX_IMPORT_UPLOAD_BYTES, onError: rejectOversized }),
    validator("param", v.object({ workspaceId: v.string() })),
    validator("form", v.object({ file: v.instance(File) })),
    workspaceAccess.fromParam("workspaceId"),
    requireWorkspacePermission({ task: ["create"] }),
    async (c) => {
      const { workspaceId } = c.req.valid("param");
      const upload = await readUpload(c);
      return c.json(await analyzeServitec(workspaceId, upload.buffer));
    },
  )
  .post(
    "/import/servitec/:workspaceId",
    describeRoute({
      operationId: "importServitec",
      tags: ["Tasks"],
      description:
        "Import a SERVITEC sheet into the workspace: the hand-kept board or one exported before. A row with the hidden ID updates its task; without it, the same row is recognised by project, concept and date. `choices` (JSON) says what to do with each PROYECTO that matches no project: map it, create it or skip its rows. Creating one needs project:create",
      responses: {
        200: {
          description: "What the import did",
          content: { "application/json": { schema: resolver(v.any()) } },
        },
      },
    }),
    bodyLimit({ maxSize: MAX_IMPORT_UPLOAD_BYTES, onError: rejectOversized }),
    validator("param", v.object({ workspaceId: v.string() })),
    validator(
      "form",
      v.object({
        file: v.instance(File),
        choices: v.optional(v.string()),
        dryRun: v.optional(v.string()),
      }),
    ),
    workspaceAccess.fromParam("workspaceId"),
    requireWorkspacePermission({ task: ["create"] }),
    requireEntitlement,
    async (c) => {
      const upload = await readUpload(c);
      const raw = c.req.valid("form").choices;
      let parsed: unknown = {};
      try {
        parsed = raw ? JSON.parse(raw) : {};
      } catch {
        throw new HTTPException(400, { message: "choices is not valid JSON" });
      }
      const choices = v.safeParse(servitecChoicesSchema, parsed);
      if (!choices.success) {
        throw new HTTPException(400, {
          message: "choices has an unexpected shape",
        });
      }
      // Crear proyectos es lo que gobierna `project:create`; importar tareas
      // en los que ya hay sigue al alcance de un `member`.
      if (
        Object.values(choices.output).some(
          (choice) => choice.action === "create",
        ) &&
        !(await hasWorkspacePermission(c, { project: ["create"] }))
      ) {
        throw new HTTPException(403, {
          message:
            "Creating projects while importing requires permission to create projects",
        });
      }
      return c.json(
        await importServitec({
          workspaceId: c.req.valid("param").workspaceId,
          currentUserId: c.get("userId"),
          buffer: upload.buffer,
          choices: choices.output,
          dryRun: upload.dryRun,
        }),
      );
    },
  )
  .delete(
    "/:id",
    describeRoute({
      operationId: "deleteTask",
      tags: ["Tasks"],
      description: "Delete a task by ID",
      responses: {
        200: {
          description: "Task deleted successfully",
          content: {
            "application/json": { schema: resolver(taskSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    workspaceAccess.fromTask(),
    requireWorkspacePermission({ task: ["delete"] }),
    async (c) => {
      const { id } = c.req.valid("param");

      const currentUserId = c.get("userId");
      const task = await deleteTask(id, currentUserId);

      return c.json(task);
    },
  )
  .put(
    "/status/:id",
    describeRoute({
      operationId: "updateTaskStatus",
      tags: ["Tasks"],
      description: "Update only the status of a task",
      responses: {
        200: {
          description: "Task status updated successfully",
          content: {
            "application/json": { schema: resolver(taskSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator("json", v.object({ status: v.string() })),
    workspaceAccess.fromTask(),
    requireWorkspacePermission({ task: ["update"] }),
    requireEntitlement,
    async (c) => {
      const { id } = c.req.valid("param");
      const { status } = c.req.valid("json");
      const currentUserId = c.get("userId");

      const task = await updateTaskStatus({ id, status, currentUserId });

      return c.json(task);
    },
  )
  .post(
    "/complete/:id",
    describeRoute({
      operationId: "completeTask",
      tags: ["Tasks"],
      description:
        "Mark a task done or undone by moving it to the first final (or first non-final) column of its project, whichever its board calls that -- Hoy and the Planner's checkbox (ADR 046)",
      responses: {
        200: {
          description: "Task moved to the target column",
          content: {
            "application/json": { schema: resolver(taskSchema) },
          },
        },
        404: {
          description:
            "The task does not exist, or its project has no matching column",
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator("json", v.object({ done: v.boolean() })),
    workspaceAccess.fromTask(),
    requireWorkspacePermission({ task: ["update"] }),
    requireEntitlement,
    async (c) => {
      const { id } = c.req.valid("param");
      const { done } = c.req.valid("json");
      const currentUserId = c.get("userId");

      const task = await completeTask({ id, done, currentUserId });

      return c.json(task);
    },
  )
  .put(
    "/priority/:id",
    describeRoute({
      operationId: "updateTaskPriority",
      tags: ["Tasks"],
      description: "Update only the priority of a task",
      responses: {
        200: {
          description: "Task priority updated successfully",
          content: {
            "application/json": { schema: resolver(taskSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator("json", v.object({ priority: v.picklist(VALID_PRIORITIES) })),
    workspaceAccess.fromTask(),
    requireWorkspacePermission({ task: ["update"] }),
    requireEntitlement,
    async (c) => {
      const { id } = c.req.valid("param");
      const { priority } = c.req.valid("json");
      const currentUserId = c.get("userId");

      const task = await updateTaskPriority({ id, priority, currentUserId });

      return c.json(task);
    },
  )
  .put(
    "/assignee/:id",
    describeRoute({
      operationId: "updateTaskAssignee",
      tags: ["Tasks"],
      description: "Assign or unassign a task to a user",
      responses: {
        200: {
          description: "Task assignee updated successfully",
          content: {
            "application/json": { schema: resolver(taskSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator("json", v.object({ userId: v.nullable(v.string()) })),
    workspaceAccess.fromTask(),
    requireWorkspacePermission({ task: ["assign"] }),
    requireEntitlement,
    async (c) => {
      const { id } = c.req.valid("param");
      const { userId } = c.req.valid("json");
      const currentUserId = c.get("userId");

      const task = await updateTaskAssignee({ id, userId, currentUserId });

      return c.json(task);
    },
  )
  .put(
    "/assignees/:id",
    describeRoute({
      operationId: "updateTaskAssignees",
      tags: ["Tasks"],
      description:
        "Replace the full set of assignees. The first one becomes the primary assignee.",
      responses: {
        200: {
          description: "Task assignees updated successfully",
          content: {
            "application/json": { schema: resolver(v.any()) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator("json", v.object({ userIds: v.array(v.string()) })),
    workspaceAccess.fromTask(),
    requireWorkspacePermission({ task: ["assign"] }),
    requireEntitlement,
    async (c) => {
      const { id } = c.req.valid("param");
      const { userIds } = c.req.valid("json");
      const currentUserId = c.get("userId");

      const task = await updateTaskAssignees({ id, userIds, currentUserId });

      return c.json(task);
    },
  )
  .put(
    "/parent/:id",
    describeRoute({
      operationId: "updateTaskParent",
      tags: ["Tasks"],
      description:
        "Hang a task under another one, or promote it to a root task with a null parent. Moves the whole subtree; rejects cycles, cross-project parents and anything past the project's depth limit.",
      responses: {
        200: {
          description: "Task reparented successfully",
          content: {
            "application/json": { schema: resolver(taskSchema) },
          },
        },
        400: {
          description:
            "The parent is the task itself, inside its own subtree, in another project, or too deep",
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator("json", v.object({ parentId: v.nullable(v.string()) })),
    workspaceAccess.fromTask(),
    requireWorkspacePermission({ task: ["update"] }),
    requireEntitlement,
    async (c) => {
      const { id } = c.req.valid("param");
      const { parentId } = c.req.valid("json");
      const currentUserId = c.get("userId");

      const task = await updateTaskParent({
        taskId: id,
        parentId,
        currentUserId,
      });

      return c.json(task);
    },
  )
  .put(
    "/estimate/:id",
    describeRoute({
      operationId: "updateTaskEstimate",
      tags: ["Tasks"],
      description:
        "Update the task estimate, in seconds - the same unit time entries use.",
      responses: {
        200: {
          description: "Task estimate updated successfully",
          content: {
            "application/json": { schema: resolver(taskSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator(
      "json",
      v.object({ estimate: v.nullable(v.pipe(v.number(), v.minValue(0))) }),
    ),
    workspaceAccess.fromTask(),
    requireWorkspacePermission({ task: ["update"] }),
    requireEntitlement,
    async (c) => {
      const { id } = c.req.valid("param");
      const { estimate } = c.req.valid("json");
      const currentUserId = c.get("userId");

      const task = await updateTaskEstimate({ id, estimate, currentUserId });

      return c.json(task);
    },
  )
  .put(
    "/custom-fields/:id",
    describeRoute({
      operationId: "updateTaskCustomFields",
      tags: ["Tasks"],
      description:
        "Set custom field values on a task. Only the keys sent are touched; an empty value clears one.",
      responses: {
        200: {
          description: "Task custom fields updated successfully",
          content: {
            "application/json": { schema: resolver(taskSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator("json", v.object({ values: v.record(v.string(), v.unknown()) })),
    workspaceAccess.fromTask(),
    requireWorkspacePermission({ task: ["update"] }),
    requireEntitlement,
    async (c) => {
      const { id } = c.req.valid("param");
      const { values } = c.req.valid("json");
      const currentUserId = c.get("userId");

      const task = await updateTaskCustomFields({ id, values, currentUserId });

      return c.json(task);
    },
  )
  .put(
    "/team/:id",
    describeRoute({
      operationId: "updateTaskTeam",
      tags: ["Tasks"],
      description: "Assign or unassign a task to a team",
      responses: {
        200: {
          description: "Task team updated successfully",
          content: {
            "application/json": { schema: resolver(taskSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator("json", v.object({ teamId: v.nullable(v.string()) })),
    workspaceAccess.fromTask(),
    requireWorkspacePermission({ task: ["assign"] }),
    requireEntitlement,
    async (c) => {
      const { id } = c.req.valid("param");
      const { teamId } = c.req.valid("json");
      const currentUserId = c.get("userId");

      const task = await updateTaskTeam({ id, teamId, currentUserId });

      return c.json(task);
    },
  )
  .put(
    "/due-date/:id",
    describeRoute({
      operationId: "updateTaskDueDate",
      tags: ["Tasks"],
      description: "Update only the due date of a task",
      responses: {
        200: {
          description: "Task due date updated successfully",
          content: {
            "application/json": { schema: resolver(taskSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator("json", v.object({ dueDate: v.optional(v.string()) })),
    workspaceAccess.fromTask(),
    requireWorkspacePermission({ task: ["update"] }),
    requireEntitlement,
    async (c) => {
      const { id } = c.req.valid("param");
      const { dueDate = null } = c.req.valid("json");
      const currentUserId = c.get("userId");

      const task = await updateTaskDueDate({
        id,
        dueDate: dueDate ? validateAndParseDate(dueDate, "dueDate") : null,
        currentUserId,
      });

      return c.json(task);
    },
  )

  .put(
    "/title/:id",
    describeRoute({
      operationId: "updateTaskTitle",
      tags: ["Tasks"],
      description: "Update only the title of a task",
      responses: {
        200: {
          description: "Task title updated successfully",
          content: {
            "application/json": { schema: resolver(taskSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator("json", v.object({ title: v.string() })),
    workspaceAccess.fromTask(),
    requireWorkspacePermission({ task: ["update"] }),
    requireEntitlement,
    async (c) => {
      const { id } = c.req.valid("param");
      const { title } = c.req.valid("json");
      const currentUserId = c.get("userId");

      const task = await updateTaskTitle({ id, title, currentUserId });

      return c.json(task);
    },
  )

  .put(
    "/image-upload/:id",
    describeRoute({
      operationId: "createTaskImageUpload",
      tags: ["Tasks"],
      description:
        "Create a presigned image upload URL for a task description or comment",
      responses: {
        200: {
          description: "Image upload URL created successfully",
          content: {
            "application/json": { schema: resolver(v.any()) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator(
      "json",
      v.object({
        filename: v.string(),
        contentType: v.string(),
        size: v.number(),
        surface: v.picklist(["description", "comment"] as const),
      }),
    ),
    workspaceAccess.fromTask(),
    requireWorkspacePermission({ task: ["update"] }),
    requireEntitlement,
    async (c) => {
      const { id } = c.req.valid("param");
      const { filename, contentType, size, surface } = c.req.valid("json");

      try {
        validateTaskAssetUploadInput(contentType, size);
      } catch (error) {
        throw new HTTPException(400, {
          message:
            error instanceof Error
              ? error.message
              : "Invalid image upload request",
        });
      }

      const [taskContext] = await db
        .select({
          taskId: taskTable.id,
          projectId: taskTable.projectId,
          workspaceId: workspaceTable.id,
        })
        .from(taskTable)
        .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
        .innerJoin(
          workspaceTable,
          eq(projectTable.workspaceId, workspaceTable.id),
        )
        .where(eq(taskTable.id, id))
        .limit(1);

      if (!taskContext) {
        throw new HTTPException(404, { message: "Task not found" });
      }

      try {
        const upload = await createTaskImageUploadUrl({
          workspaceId: taskContext.workspaceId,
          projectId: taskContext.projectId,
          taskId: taskContext.taskId,
          surface,
          filename,
          contentType,
        });

        return c.json(upload);
      } catch (error) {
        throw new HTTPException(503, {
          message:
            error instanceof Error
              ? error.message
              : "Image uploads are not configured",
        });
      }
    },
  )
  .post(
    "/image-upload/:id/finalize",
    describeRoute({
      operationId: "finalizeTaskImageUpload",
      tags: ["Tasks"],
      description:
        "Finalize an uploaded task image and create a private asset record",
      responses: {
        200: {
          description: "Image upload finalized successfully",
          content: {
            "application/json": { schema: resolver(v.any()) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator(
      "json",
      v.object({
        key: v.string(),
        filename: v.string(),
        contentType: v.string(),
        size: v.number(),
        surface: v.picklist(["description", "comment"] as const),
      }),
    ),
    workspaceAccess.fromTask(),
    requireWorkspacePermission({ task: ["update"] }),
    requireEntitlement,
    async (c) => {
      const { id } = c.req.valid("param");
      const { key, filename, contentType, size, surface } = c.req.valid("json");
      const userId = c.get("userId");

      try {
        validateTaskAssetUploadInput(contentType, size);
      } catch (error) {
        throw new HTTPException(400, {
          message:
            error instanceof Error
              ? error.message
              : "Invalid image upload request",
        });
      }

      const [taskContext] = await db
        .select({
          taskId: taskTable.id,
          projectId: taskTable.projectId,
          workspaceId: workspaceTable.id,
        })
        .from(taskTable)
        .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
        .innerJoin(
          workspaceTable,
          eq(projectTable.workspaceId, workspaceTable.id),
        )
        .where(eq(taskTable.id, id))
        .limit(1);

      if (!taskContext) {
        throw new HTTPException(404, { message: "Task not found" });
      }

      const normalizedKey = key.trim();
      if (
        !assertTaskImageKeyMatchesContext(normalizedKey, {
          workspaceId: taskContext.workspaceId,
          projectId: taskContext.projectId,
          taskId: taskContext.taskId,
          surface,
        })
      ) {
        throw new HTTPException(400, {
          message: "Image upload key does not match the task context.",
        });
      }

      const [existingAsset] = await db
        .select({ id: assetTable.id })
        .from(assetTable)
        .where(eq(assetTable.objectKey, normalizedKey))
        .limit(1);

      const [asset] = existingAsset
        ? await db
            .update(assetTable)
            .set({
              workspaceId: taskContext.workspaceId,
              projectId: taskContext.projectId,
              taskId: taskContext.taskId,
              filename,
              mimeType: contentType,
              size,
              kind: isImageContentType(contentType) ? "image" : "attachment",
              surface,
              createdBy: userId || null,
            })
            .where(eq(assetTable.id, existingAsset.id))
            .returning({
              id: assetTable.id,
            })
        : await db
            .insert(assetTable)
            .values({
              workspaceId: taskContext.workspaceId,
              projectId: taskContext.projectId,
              taskId: taskContext.taskId,
              objectKey: normalizedKey,
              filename,
              mimeType: contentType,
              size,
              kind: isImageContentType(contentType) ? "image" : "attachment",
              surface,
              createdBy: userId || null,
            })
            .returning({
              id: assetTable.id,
            });

      if (!asset) {
        throw new HTTPException(500, {
          message: "Failed to save asset",
        });
      }

      const apiBaseUrl = normalizeApiServerUrl(
        process.env.RIUNA_API_URL || new URL(c.req.url).origin,
      );
      return c.json({
        id: asset.id,
        url: `${apiBaseUrl}/asset/${asset.id}`,
      });
    },
  )
  .put(
    "/description/:id",
    describeRoute({
      operationId: "updateTaskDescription",
      tags: ["Tasks"],
      description: "Update only the description of a task",
      responses: {
        200: {
          description: "Task description updated successfully",
          content: {
            "application/json": { schema: resolver(taskSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator("json", v.object({ description: v.string() })),
    workspaceAccess.fromTask(),
    requireWorkspacePermission({ task: ["update"] }),
    requireEntitlement,
    async (c) => {
      const { id } = c.req.valid("param");
      const { description } = c.req.valid("json");
      const currentUserId = c.get("userId");

      const task = await updateTaskDescription({
        id,
        description,
        currentUserId,
      });

      return c.json(task);
    },
  );

export default task;
