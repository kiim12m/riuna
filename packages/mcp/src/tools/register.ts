import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { RiunaClient } from "../riuna/client.js";
import { buildFullTaskUpdateBody } from "../riuna/task-helpers.js";
import { errorResult, textResult } from "../utils/mcp-result.js";

const prioritySchema = z.enum([
  "no-priority",
  "low",
  "medium",
  "high",
  "urgent",
]);

const nonEmptyString = z.string().trim().min(1);
const optionalNonEmptyString = nonEmptyString.optional();
const nullableOptionalNonEmptyString = nonEmptyString.nullable().optional();
const isoDateTimeSchema = z.string().datetime({ offset: true });
const optionalIsoDateTimeSchema = isoDateTimeSchema.optional();
const nullableOptionalIsoDateTimeSchema = isoDateTimeSchema
  .nullable()
  .optional();
const hexColorSchema = z
  .string()
  .regex(
    /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/,
    "Expected a hex color like #FF6600",
  );

/**
 * Lo que una tarea tiene ademas de sus campos de base y que Riuna guarda en
 * otras rutas: varios asignados, un departamento y los campos personalizados.
 * Sin esto un agente podia crear la tarea y no repartirla ni rellenar su
 * presupuesto (ADR 010, ADR 013).
 */
const taskExtrasShape = {
  customFields: z
    .record(z.string(), z.unknown())
    .optional()
    .describe(
      'Custom field values by field key, e.g. {"presupuesto": 1500}. Only the keys sent change; null clears one.',
    ),
  assigneeIds: z
    .array(nonEmptyString)
    .optional()
    .describe(
      "Replaces the whole set of assignees; the first one becomes the primary assignee. Needs the permission to assign tasks.",
    ),
  teamId: nullableOptionalNonEmptyString.describe(
    "Assign the task to a team (department); null takes it off its team.",
  ),
};

type TaskExtras = {
  customFields?: Record<string, unknown>;
  assigneeIds?: string[];
  teamId?: string | null;
};

function run(fn: () => Promise<unknown>): Promise<CallToolResult> {
  return fn()
    .then((data) => textResult(data))
    .catch((e: unknown) =>
      errorResult(e instanceof Error ? e.message : String(e)),
    );
}

export function registerTools(
  server: McpServer,
  ctx: { client: RiunaClient },
): void {
  const { client } = ctx;

  /**
   * Guarda los asignados, el equipo y los campos personalizados de una tarea que
   * ya existe. Cada uno tiene su ruta y su permiso, asi que si uno falla la tarea
   * ya esta guardada: el error lo dice con su id en vez de dejar creer que no se
   * creo.
   */
  async function applyTaskExtras(taskId: string, extras: TaskExtras) {
    const at = (segment: string) =>
      `/api/task/${segment}/${encodeURIComponent(taskId)}`;
    try {
      if (extras.assigneeIds !== undefined) {
        await client.json(at("assignees"), {
          method: "PUT",
          body: JSON.stringify({ userIds: extras.assigneeIds }),
        });
      }
      if (extras.teamId !== undefined) {
        await client.json(at("team"), {
          method: "PUT",
          body: JSON.stringify({ teamId: extras.teamId }),
        });
      }
      if (extras.customFields !== undefined) {
        await client.json(at("custom-fields"), {
          method: "PUT",
          body: JSON.stringify({ values: extras.customFields }),
        });
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Task ${taskId} was saved, but its assignees, team or custom fields were not: ${reason}`,
      );
    }
  }

  const hasExtras = (extras: TaskExtras) =>
    extras.customFields !== undefined ||
    extras.assigneeIds !== undefined ||
    extras.teamId !== undefined;

  server.registerTool(
    "whoami",
    {
      description:
        "Return the current Riuna session and user for the cached device token.",
      inputSchema: z.object({}),
    },
    async () =>
      run(() => client.json("/api/auth/get-session", { method: "GET" })),
  );

  server.registerTool(
    "list_workspaces",
    {
      description:
        "List workspaces (Better Auth organizations) the signed-in user can access.",
      inputSchema: z.object({}),
    },
    async () =>
      run(() => client.json("/api/auth/organization/list", { method: "GET" })),
  );

  server.registerTool(
    "list_projects",
    {
      description:
        "List projects in a workspace. Personal inboxes are hidden from this list; their tasks are not private.",
      inputSchema: z.object({
        workspaceId: nonEmptyString.describe("Workspace ID"),
        includeArchived: z
          .boolean()
          .optional()
          .describe("Include archived projects"),
      }),
    },
    async (args) => {
      const { workspaceId, includeArchived } = args;
      const qs = new URLSearchParams({ workspaceId });
      if (includeArchived === true) {
        qs.set("includeArchived", "true");
      }
      return run(() =>
        client.json(`/api/project?${qs.toString()}`, { method: "GET" }),
      );
    },
  );

  server.registerTool(
    "get_project",
    {
      description: "Get a single project by ID.",
      inputSchema: z.object({ id: nonEmptyString }),
    },
    async (args) =>
      run(() => client.json(`/api/project/${encodeURIComponent(args.id)}`)),
  );

  server.registerTool(
    "create_project",
    {
      description: "Create a project in a workspace.",
      inputSchema: z.object({
        name: nonEmptyString,
        workspaceId: nonEmptyString,
        icon: nonEmptyString,
        slug: nonEmptyString,
      }),
    },
    async (args) =>
      run(() =>
        client.json("/api/project", {
          method: "POST",
          body: JSON.stringify({
            name: args.name,
            workspaceId: args.workspaceId,
            icon: args.icon,
            slug: args.slug,
          }),
        }),
      ),
  );

  server.registerTool(
    "update_project",
    {
      description:
        "Update project metadata (PATCH-style: only provided fields are changed).",
      inputSchema: z.object({
        id: nonEmptyString,
        name: optionalNonEmptyString,
        icon: z.string().optional(),
        slug: optionalNonEmptyString,
        description: z.string().optional(),
        isPublic: z.boolean().optional(),
      }),
    },
    async (args) => {
      const { id, ...patch } = args;
      return run(async () => {
        const existing = (await client.json(
          `/api/project/${encodeURIComponent(id)}`,
          { method: "GET" },
        )) as Record<string, unknown>;
        const name =
          patch.name ??
          (typeof existing.name === "string" ? existing.name : "");
        if (!name) {
          throw new Error("Cannot update project: missing name.");
        }
        const icon =
          patch.icon !== undefined
            ? patch.icon
            : typeof existing.icon === "string"
              ? existing.icon
              : "Layout";
        const slug =
          patch.slug ??
          (typeof existing.slug === "string" ? existing.slug : "");
        if (!slug) {
          throw new Error("Cannot update project: missing slug.");
        }
        const description =
          patch.description !== undefined
            ? patch.description
            : typeof existing.description === "string"
              ? existing.description
              : "";
        const isPublic =
          patch.isPublic !== undefined
            ? patch.isPublic
            : typeof existing.isPublic === "boolean"
              ? existing.isPublic
              : false;

        const body = { name, icon, slug, description, isPublic };

        return client.json(`/api/project/${encodeURIComponent(id)}`, {
          method: "PUT",
          body: JSON.stringify(body),
        });
      });
    },
  );

  const listTasksSchema = z.object({
    projectId: nonEmptyString,
    status: optionalNonEmptyString,
    priority: prioritySchema.optional(),
    assigneeId: optionalNonEmptyString,
    page: z.number().int().positive().optional(),
    limit: z.number().int().positive().optional(),
    sortBy: z
      .enum(["createdAt", "priority", "dueDate", "position", "title", "number"])
      .optional(),
    sortOrder: z.enum(["asc", "desc"]).optional(),
    dueBefore: optionalIsoDateTimeSchema,
    dueAfter: optionalIsoDateTimeSchema,
    filter: z
      .string()
      .optional()
      .describe(
        'A filter as JSON, the same the views use: {"type":"condition","field":"custom.presupuesto","operator":"gt","value":1000}, or several combined with {"type":"and","children":[…]} or {"type":"or","children":[…]}, and negated with {"type":"not","child":…}. Fields: title, description, status, priority, number, dueDate, assignee, team, done, completedAt, epic and assignees (by id), label (by name) and custom.<key>.',
      ),
    treeScope: z
      .enum(["matching", "roots", "withDescendants"])
      .optional()
      .describe(
        "With a filter: only the tasks that match, only the top-level ones, or the matches with their whole branch.",
      ),
  });

  server.registerTool(
    "list_tasks",
    {
      description: "List tasks for a project (optionally filtered/sorted).",
      inputSchema: listTasksSchema,
    },
    async (args) => {
      const { projectId, ...rest } = args;
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(rest)) {
        if (v === undefined || v === null) {
          continue;
        }
        qs.set(k, String(v));
      }
      const q = qs.toString();
      const path = `/api/task/tasks/${encodeURIComponent(projectId)}${q ? `?${q}` : ""}`;
      return run(() => client.json(path, { method: "GET" }));
    },
  );

  server.registerTool(
    "get_task",
    {
      description: "Get a task by ID.",
      inputSchema: z.object({ taskId: nonEmptyString }),
    },
    async (args) =>
      run(() =>
        client.json(`/api/task/${encodeURIComponent(args.taskId)}`, {
          method: "GET",
        }),
      ),
  );

  server.registerTool(
    "create_task",
    {
      description: "Create a task in a project.",
      inputSchema: z.object({
        projectId: nonEmptyString,
        title: nonEmptyString,
        description: z.string(),
        priority: prioritySchema,
        status: nonEmptyString,
        startDate: optionalIsoDateTimeSchema,
        dueDate: optionalIsoDateTimeSchema,
        userId: optionalNonEmptyString,
        ...taskExtrasShape,
      }),
    },
    async (args) => {
      const { customFields, assigneeIds, teamId } = args;
      const extras: TaskExtras = { customFields, assigneeIds, teamId };
      const body: Record<string, string | undefined> = {
        title: args.title,
        description: args.description,
        priority: args.priority,
        status: args.status,
      };
      if (args.startDate !== undefined) {
        body.startDate = args.startDate;
      }
      if (args.dueDate !== undefined) {
        body.dueDate = args.dueDate;
      }
      if (args.userId !== undefined) {
        body.userId = args.userId;
      }
      return run(async () => {
        const created = (await client.json(
          `/api/task/${encodeURIComponent(args.projectId)}`,
          { method: "POST", body: JSON.stringify(body) },
        )) as { id: string };
        if (!hasExtras(extras)) return created;
        await applyTaskExtras(created.id, extras);
        // Lo que se devuelve es la tarea como quedo, no como nacio.
        return client.json(`/api/task/${encodeURIComponent(created.id)}`, {
          method: "GET",
        });
      });
    },
  );

  const updateTaskSchema = z.object({
    taskId: nonEmptyString,
    title: optionalNonEmptyString,
    description: z.string().nullable().optional(),
    status: optionalNonEmptyString,
    priority: prioritySchema.optional(),
    projectId: optionalNonEmptyString,
    position: z.number().optional(),
    startDate: nullableOptionalIsoDateTimeSchema,
    dueDate: nullableOptionalIsoDateTimeSchema,
    userId: nullableOptionalNonEmptyString,
    ...taskExtrasShape,
  });

  server.registerTool(
    "update_task",
    {
      description:
        "Update a task (fetches current task, merges fields, then full update).",
      inputSchema: updateTaskSchema,
    },
    async (args) => {
      const { taskId, customFields, assigneeIds, teamId, ...patch } = args;
      const extras: TaskExtras = { customFields, assigneeIds, teamId };
      return run(async () => {
        const existing = (await client.json(
          `/api/task/${encodeURIComponent(taskId)}`,
          { method: "GET" },
        )) as Record<string, unknown>;
        const body = buildFullTaskUpdateBody(existing, patch);
        const updated = await client.json(
          `/api/task/${encodeURIComponent(taskId)}`,
          { method: "PUT", body: JSON.stringify(body) },
        );
        if (!hasExtras(extras)) return updated;
        await applyTaskExtras(taskId, extras);
        return client.json(`/api/task/${encodeURIComponent(taskId)}`, {
          method: "GET",
        });
      });
    },
  );

  server.registerTool(
    "move_task",
    {
      description:
        "Move a task to another project (and optional column status).",
      inputSchema: z.object({
        taskId: nonEmptyString,
        destinationProjectId: nonEmptyString,
        destinationStatus: optionalNonEmptyString,
      }),
    },
    async (args) =>
      run(() =>
        client.json(`/api/task/move/${encodeURIComponent(args.taskId)}`, {
          method: "PUT",
          body: JSON.stringify({
            destinationProjectId: args.destinationProjectId,
            ...(args.destinationStatus !== undefined
              ? { destinationStatus: args.destinationStatus }
              : {}),
          }),
        }),
      ),
  );

  server.registerTool(
    "update_task_status",
    {
      description: "Update only the status (column) of a task.",
      inputSchema: z.object({
        taskId: nonEmptyString,
        status: nonEmptyString,
      }),
    },
    async (args) =>
      run(() =>
        client.json(`/api/task/status/${encodeURIComponent(args.taskId)}`, {
          method: "PUT",
          body: JSON.stringify({ status: args.status }),
        }),
      ),
  );

  server.registerTool(
    "list_task_comments",
    {
      description: "List comments on a task.",
      inputSchema: z.object({ taskId: nonEmptyString }),
    },
    async (args) =>
      run(() =>
        client.json(`/api/comment/${encodeURIComponent(args.taskId)}`, {
          method: "GET",
        }),
      ),
  );

  server.registerTool(
    "create_task_comment",
    {
      description: "Add a comment to a task.",
      inputSchema: z.object({
        taskId: nonEmptyString,
        content: nonEmptyString,
      }),
    },
    async (args) =>
      run(() =>
        client.json(`/api/comment/${encodeURIComponent(args.taskId)}`, {
          method: "POST",
          body: JSON.stringify({ content: args.content }),
        }),
      ),
  );

  server.registerTool(
    "update_task_comment",
    {
      description: "Update one of your comments on a task.",
      inputSchema: z.object({
        commentId: nonEmptyString,
        content: nonEmptyString,
      }),
    },
    async (args) =>
      run(() =>
        client.json(`/api/comment/${encodeURIComponent(args.commentId)}`, {
          method: "PUT",
          body: JSON.stringify({ content: args.content }),
        }),
      ),
  );

  server.registerTool(
    "delete_task_comment",
    {
      description: "Delete one of your comments from a task.",
      inputSchema: z.object({ commentId: nonEmptyString }),
    },
    async (args) =>
      run(() =>
        client.json(`/api/comment/${encodeURIComponent(args.commentId)}`, {
          method: "DELETE",
        }),
      ),
  );

  server.registerTool(
    "list_workspace_labels",
    {
      description: "List labels defined in a workspace.",
      inputSchema: z.object({ workspaceId: nonEmptyString }),
    },
    async (args) =>
      run(() =>
        client.json(
          `/api/label/workspace/${encodeURIComponent(args.workspaceId)}`,
          { method: "GET" },
        ),
      ),
  );

  server.registerTool(
    "create_label",
    {
      description:
        "Create a label in a workspace (optionally attach to a task).",
      inputSchema: z.object({
        name: nonEmptyString,
        color: hexColorSchema,
        workspaceId: nonEmptyString,
        taskId: optionalNonEmptyString,
      }),
    },
    async (args) =>
      run(() =>
        client.json("/api/label", {
          method: "POST",
          body: JSON.stringify({
            name: args.name,
            color: args.color,
            workspaceId: args.workspaceId,
            ...(args.taskId !== undefined ? { taskId: args.taskId } : {}),
          }),
        }),
      ),
  );

  server.registerTool(
    "attach_label_to_task",
    {
      description: "Attach an existing label to a task.",
      inputSchema: z.object({
        labelId: nonEmptyString,
        taskId: nonEmptyString,
      }),
    },
    async (args) =>
      run(() =>
        client.json(`/api/label/${encodeURIComponent(args.labelId)}/task`, {
          method: "PUT",
          body: JSON.stringify({ taskId: args.taskId }),
        }),
      ),
  );

  server.registerTool(
    "detach_label_from_task",
    {
      description: "Detach a label from its current task.",
      inputSchema: z.object({ labelId: nonEmptyString }),
    },
    async (args) =>
      run(() =>
        client.json(`/api/label/${encodeURIComponent(args.labelId)}/task`, {
          method: "DELETE",
        }),
      ),
  );

  server.registerTool(
    "update_task_parent",
    {
      description:
        "Hang a task under another task of the same project, or promote it to a root task by passing a null parentId. Moves the whole subtree. Rejects cycles, cross-project parents and anything past the project depth limit.",
      inputSchema: z.object({
        taskId: nonEmptyString,
        parentId: z.string().nullable(),
      }),
    },
    async (args) =>
      run(() =>
        client.json(`/api/task/parent/${encodeURIComponent(args.taskId)}`, {
          method: "PUT",
          body: JSON.stringify({ parentId: args.parentId }),
        }),
      ),
  );

  server.registerTool(
    "list_project_epics",
    {
      description:
        "List the epics of a project with how many tasks each one holds.",
      inputSchema: z.object({ projectId: nonEmptyString }),
    },
    async (args) =>
      run(() =>
        client.json(`/api/epic/project/${encodeURIComponent(args.projectId)}`, {
          method: "GET",
        }),
      ),
  );

  server.registerTool(
    "update_task_epics",
    {
      description:
        "Replace the full set of epics a task belongs to. Pass an empty array to detach it from every epic.",
      inputSchema: z.object({
        taskId: nonEmptyString,
        epicIds: z.array(nonEmptyString),
      }),
    },
    async (args) =>
      run(() =>
        client.json(`/api/epic/task/${encodeURIComponent(args.taskId)}`, {
          method: "PUT",
          body: JSON.stringify({ epicIds: args.epicIds }),
        }),
      ),
  );

  server.registerTool(
    "create_task_relation",
    {
      description:
        "Create a relation between two tasks. relationType: 'blocks' (sourceTaskId blocks targetTaskId) or 'related' (bidirectional). Parent/child hierarchy is not a relation: use update_task_parent.",
      inputSchema: z.object({
        sourceTaskId: nonEmptyString,
        targetTaskId: nonEmptyString,
        relationType: z.enum(["blocks", "related"]),
      }),
    },
    async (args) =>
      run(() =>
        client.json("/api/task-relation", {
          method: "POST",
          body: JSON.stringify({
            sourceTaskId: args.sourceTaskId,
            targetTaskId: args.targetTaskId,
            relationType: args.relationType,
          }),
        }),
      ),
  );

  server.registerTool(
    "get_task_relations",
    {
      description: "List all relations (blocks/related) involving a task.",
      inputSchema: z.object({ taskId: nonEmptyString }),
    },
    async (args) =>
      run(() =>
        client.json(`/api/task-relation/${encodeURIComponent(args.taskId)}`, {
          method: "GET",
        }),
      ),
  );

  server.registerTool(
    "delete_task_relation",
    {
      description: "Delete a task relation by its relation ID.",
      inputSchema: z.object({ id: nonEmptyString }),
    },
    async (args) =>
      run(() =>
        client.json(`/api/task-relation/${encodeURIComponent(args.id)}`, {
          method: "DELETE",
        }),
      ),
  );

  server.registerTool(
    "delete_label",
    {
      description:
        "Delete a label by ID. Only task-associated labels can be deleted; workspace-level labels (taskId null) are rejected by the API.",
      inputSchema: z.object({ id: nonEmptyString }),
    },
    async (args) =>
      run(async () => {
        const label = (await client.json(
          `/api/label/${encodeURIComponent(args.id)}`,
          { method: "GET" },
        )) as { taskId?: string | null };
        if (!label?.taskId) {
          throw new Error(
            "Label is not associated with a task and cannot be deleted (workspace-level labels are not deletable via this endpoint).",
          );
        }
        return client.json(`/api/label/${encodeURIComponent(args.id)}`, {
          method: "DELETE",
        });
      }),
  );

  server.registerTool(
    "list_workspace_members",
    {
      description:
        "List the members of a workspace. Use this to resolve the user ID an assignee tool expects.",
      inputSchema: z.object({ workspaceId: nonEmptyString }),
    },
    async (args) =>
      run(() =>
        client.json(
          `/api/workspace/${encodeURIComponent(args.workspaceId)}/members`,
        ),
      ),
  );

  server.registerTool(
    "search",
    {
      description:
        "Search across tasks, projects, workspaces, comments, and activities.",
      inputSchema: z.object({
        q: nonEmptyString.describe("Search query"),
        type: z
          .enum([
            "all",
            "tasks",
            "projects",
            "workspaces",
            "comments",
            "activities",
          ])
          .optional()
          .describe("Restrict results to one kind. Defaults to all."),
        workspaceId: optionalNonEmptyString.describe("Limit to one workspace"),
        projectId: optionalNonEmptyString.describe("Limit to one project"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe("Maximum results, 1 to 50. Defaults to 20."),
      }),
    },
    async (args) => {
      const qs = new URLSearchParams({ q: args.q });
      if (args.type) qs.set("type", args.type);
      if (args.workspaceId) qs.set("workspaceId", args.workspaceId);
      if (args.projectId) qs.set("projectId", args.projectId);
      if (args.limit !== undefined) qs.set("limit", String(args.limit));
      return run(() => client.json(`/api/search?${qs.toString()}`));
    },
  );

  server.registerTool(
    "list_project_columns",
    {
      description:
        "List a project's columns. Their slugs are the values update_task_status and create_task accept as a status.",
      inputSchema: z.object({ projectId: nonEmptyString }),
    },
    async (args) =>
      run(() =>
        client.json(`/api/column/${encodeURIComponent(args.projectId)}`),
      ),
  );

  server.registerTool(
    "delete_task",
    {
      description: "Delete a task by ID.",
      inputSchema: z.object({ taskId: nonEmptyString }),
    },
    async (args) =>
      run(() =>
        client.json(`/api/task/${encodeURIComponent(args.taskId)}`, {
          method: "DELETE",
        }),
      ),
  );

  server.registerTool(
    "update_task_assignee",
    {
      description:
        "Assign a task to a workspace member, or pass a null userId to unassign it.",
      inputSchema: z.object({
        taskId: nonEmptyString,
        userId: nonEmptyString
          .nullable()
          .describe("Member user ID, or null to unassign"),
      }),
    },
    async (args) =>
      run(() =>
        client.json(`/api/task/assignee/${encodeURIComponent(args.taskId)}`, {
          method: "PUT",
          body: JSON.stringify({ userId: args.userId }),
        }),
      ),
  );

  server.registerTool(
    "update_task_due_date",
    {
      description: "Set a task's due date. Omit dueDate to clear it.",
      inputSchema: z.object({
        taskId: nonEmptyString,
        dueDate: optionalIsoDateTimeSchema,
      }),
    },
    async (args) =>
      run(() =>
        client.json(`/api/task/due-date/${encodeURIComponent(args.taskId)}`, {
          method: "PUT",
          body: JSON.stringify(
            args.dueDate === undefined ? {} : { dueDate: args.dueDate },
          ),
        }),
      ),
  );

  server.registerTool(
    "get_plan",
    {
      description:
        "The current user's personal plan: tasks placed on a day in a rolling window, tasks still unplanned, projected recurring occurrences, the capacity of each day, and the fixed appointments of each day. Never reflects the task's due date.",
      inputSchema: z.object({
        workspaceId: nonEmptyString.describe("Workspace ID"),
        days: z
          .number()
          .int()
          .min(1)
          .max(60)
          .optional()
          .describe("Window size in days, default 15, max 60"),
        from: optionalNonEmptyString.describe(
          "First day of the window, yyyy-mm-dd; default today",
        ),
      }),
    },
    async (args) => {
      const qs = new URLSearchParams({ workspaceId: args.workspaceId });
      if (args.days !== undefined) qs.set("days", String(args.days));
      if (args.from !== undefined) qs.set("from", args.from);
      return run(() => client.json(`/api/planner?${qs.toString()}`));
    },
  );

  server.registerTool(
    "plan_task",
    {
      description:
        "Place a task on a day of the current user's plan, or move it. Never changes the task's due date.",
      inputSchema: z.object({
        taskId: nonEmptyString,
        workspaceId: nonEmptyString.describe("Workspace ID"),
        plannedDate: nonEmptyString.describe("Day to plan for, yyyy-mm-dd"),
        position: z
          .number()
          .int()
          .optional()
          .describe(
            "Position within the day; omit to keep it (same day) or append (new day)",
          ),
        startMinute: z
          .number()
          .int()
          .min(0)
          .max(1439)
          .nullable()
          .optional()
          .describe(
            "Minutes since midnight to anchor a time, or null to unanchor",
          ),
      }),
    },
    async (args) => {
      const qs = new URLSearchParams({ workspaceId: args.workspaceId });
      return run(() =>
        client.json(
          `/api/planner/${encodeURIComponent(args.taskId)}?${qs.toString()}`,
          {
            method: "PUT",
            body: JSON.stringify({
              plannedDate: args.plannedDate,
              ...(args.position !== undefined
                ? { position: args.position }
                : {}),
              ...(args.startMinute !== undefined
                ? { startMinute: args.startMinute }
                : {}),
            }),
          },
        ),
      );
    },
  );

  server.registerTool(
    "get_today",
    {
      description:
        "The current user's day: what is planned for today (anchored times first), what was planned earlier and is still open, what is overdue or due today and unplanned, and what was finished today.",
      inputSchema: z.object({
        workspaceId: nonEmptyString.describe("Workspace ID"),
      }),
    },
    async (args) => {
      const qs = new URLSearchParams({ workspaceId: args.workspaceId });
      return run(() => client.json(`/api/today?${qs.toString()}`));
    },
  );

  server.registerTool(
    "capture_task",
    {
      description:
        "Capture a task assigned to the current user, in their personal inbox unless a project is given. plannedDate places it on a day of the personal plan and never sets the due date; dueDate is the due date. Estimate is in seconds.",
      inputSchema: z.object({
        workspaceId: nonEmptyString.describe("Workspace ID"),
        title: nonEmptyString,
        projectId: optionalNonEmptyString.describe(
          "Project ID; omit for the current user's inbox",
        ),
        priority: prioritySchema.optional(),
        estimate: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe("Estimate in seconds"),
        dueDate: optionalNonEmptyString.describe("Due day, yyyy-mm-dd"),
        plannedDate: optionalNonEmptyString.describe(
          "Day of the personal plan, yyyy-mm-dd",
        ),
        startMinute: z
          .number()
          .int()
          .min(0)
          .max(1439)
          .optional()
          .describe("Minutes since midnight to anchor; needs plannedDate"),
        labelIds: z
          .array(nonEmptyString)
          .max(20)
          .optional()
          .describe("Workspace label IDs"),
      }),
    },
    async (args) =>
      run(() =>
        client.json("/api/capture", {
          method: "POST",
          body: JSON.stringify(args),
        }),
      ),
  );

  server.registerTool(
    "list_task_time_entries",
    {
      description: "List the time entries logged against a task.",
      inputSchema: z.object({ taskId: nonEmptyString }),
    },
    async (args) =>
      run(() =>
        client.json(`/api/time-entry/task/${encodeURIComponent(args.taskId)}`),
      ),
  );

  server.registerTool(
    "get_time_entry",
    {
      description: "Get a single time entry by ID.",
      inputSchema: z.object({ id: nonEmptyString }),
    },
    async (args) =>
      run(() => client.json(`/api/time-entry/${encodeURIComponent(args.id)}`)),
  );

  server.registerTool(
    "create_time_entry",
    {
      description:
        "Log time against a task. Omit endTime to leave the entry running.",
      inputSchema: z.object({
        taskId: nonEmptyString,
        startTime: isoDateTimeSchema,
        endTime: optionalIsoDateTimeSchema,
        description: optionalNonEmptyString,
      }),
    },
    async (args) =>
      run(() =>
        client.json("/api/time-entry", {
          method: "POST",
          body: JSON.stringify({
            taskId: args.taskId,
            startTime: args.startTime,
            ...(args.endTime ? { endTime: args.endTime } : {}),
            ...(args.description ? { description: args.description } : {}),
          }),
        }),
      ),
  );

  server.registerTool(
    "update_time_entry",
    {
      description:
        "Update a time entry. startTime is required; omitting endTime keeps the stored one. startTime cannot be later than the end time.",
      inputSchema: z.object({
        id: nonEmptyString,
        startTime: isoDateTimeSchema,
        endTime: optionalIsoDateTimeSchema,
        description: optionalNonEmptyString,
      }),
    },
    async (args) =>
      run(() =>
        client.json(`/api/time-entry/${encodeURIComponent(args.id)}`, {
          method: "PUT",
          body: JSON.stringify({
            startTime: args.startTime,
            ...(args.endTime ? { endTime: args.endTime } : {}),
            ...(args.description ? { description: args.description } : {}),
          }),
        }),
      ),
  );

  server.registerTool(
    "get_running_timer",
    {
      description:
        "Get the current user's running time entry, if any, plus the last tracked task to resume when nothing is running.",
      inputSchema: z.object({
        workspaceId: nonEmptyString.describe("Workspace ID"),
      }),
    },
    async (args) => {
      const qs = new URLSearchParams({ workspaceId: args.workspaceId });
      return run(() =>
        client.json(`/api/time-entry/running?${qs.toString()}`, {
          method: "GET",
        }),
      );
    },
  );

  server.registerTool(
    "start_timer",
    {
      description:
        "Start tracking time on a task. Stops whatever the user was tracking before -one timer per person-.",
      inputSchema: z.object({ taskId: nonEmptyString }),
    },
    async (args) =>
      run(() =>
        client.json("/api/time-entry/start", {
          method: "POST",
          body: JSON.stringify({ taskId: args.taskId }),
        }),
      ),
  );

  server.registerTool(
    "stop_timer",
    {
      description:
        "Stop the current user's running time entry. Omit endTime to stop now.",
      inputSchema: z.object({ endTime: optionalIsoDateTimeSchema }),
    },
    async (args) =>
      run(() =>
        client.json("/api/time-entry/stop", {
          method: "POST",
          body: JSON.stringify(args.endTime ? { endTime: args.endTime } : {}),
        }),
      ),
  );

  server.registerTool(
    "list_task_activity",
    {
      description: "List a task's activity history.",
      inputSchema: z.object({ taskId: nonEmptyString }),
    },
    async (args) =>
      run(() =>
        client.json(`/api/activity/${encodeURIComponent(args.taskId)}`),
      ),
  );

  server.registerTool(
    "list_notifications",
    {
      description: "List the signed-in user's notifications.",
      inputSchema: z.object({}),
    },
    async () => run(() => client.json("/api/notification")),
  );
}
