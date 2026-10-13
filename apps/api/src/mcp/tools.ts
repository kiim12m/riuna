import { z } from "zod";

type McpToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

/** Minimal tool-registration contract shared by legacy and modern MCP servers. */
export type McpToolRegistrar = {
  registerTool(
    name: string,
    config: {
      description: string;
      inputSchema: z.ZodObject;
    },
    callback: (args: unknown) => Promise<McpToolResult>,
  ): unknown;
};

type ShapeToolServer = {
  registerTool(
    name: string,
    config: { description: string; inputSchema: z.ZodRawShape },
    callback: (args: unknown) => Promise<McpToolResult>,
  ): unknown;
};

export function toMcpToolRegistrar(server: ShapeToolServer): McpToolRegistrar {
  return {
    registerTool: (name, config, callback) =>
      server.registerTool(
        name,
        {
          description: config.description,
          inputSchema: config.inputSchema.shape,
        },
        (args) => callback(args),
      ),
  };
}

class ApiClient {
  constructor(
    private baseUrl: string,
    private token: string,
  ) {}

  async json<T = unknown>(path: string, init?: RequestInit): Promise<T> {
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${this.token}`);
    if (init?.body != null && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const url = `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const res = await fetch(url, {
      ...init,
      headers,
      signal: AbortSignal.timeout(10_000),
    });

    const text = await res.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    if (!res.ok) {
      const detail =
        typeof body === "object" && body !== null && "message" in body
          ? (body as { message: string }).message
          : typeof body === "string" && body.length > 0
            ? body.slice(0, 500)
            : `HTTP ${res.status}`;
      throw new Error(`${path}: ${detail}`);
    }
    return body as T;
  }
}

function textResult(data: unknown, isError = false): McpToolResult {
  const text =
    typeof data === "string" ? data : (JSON.stringify(data, null, 2) ?? "");
  return { content: [{ type: "text", text }], isError };
}

function errorResult(message: string): McpToolResult {
  return textResult({ error: message }, true);
}

function run(fn: () => Promise<unknown>): Promise<McpToolResult> {
  return fn()
    .then((data) => textResult(data))
    .catch((e: unknown) =>
      errorResult(e instanceof Error ? e.message : String(e)),
    );
}

const PRIORITIES = ["no-priority", "low", "medium", "high", "urgent"] as const;

function isTaskPriority(v: string): v is (typeof PRIORITIES)[number] {
  return (PRIORITIES as readonly string[]).includes(v);
}

function formatOptionalIso(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return undefined;
}

function buildFullTaskUpdateBody(
  existing: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, string | number | undefined> {
  const positionRaw = patch.position ?? existing.position;
  const position =
    typeof positionRaw === "number"
      ? positionRaw
      : typeof positionRaw === "string"
        ? Number(positionRaw)
        : Number.NaN;
  if (!Number.isFinite(position))
    throw new Error(
      "Cannot update task: missing numeric `position` on existing task.",
    );

  const title =
    (patch.title as string) ??
    (typeof existing.title === "string" ? existing.title : undefined);
  if (!title) throw new Error("Cannot update task: missing title.");

  const description =
    patch.description !== undefined
      ? patch.description === null
        ? ""
        : String(patch.description)
      : existing.description == null
        ? ""
        : String(existing.description);

  const status =
    (patch.status as string) ??
    (typeof existing.status === "string" ? existing.status : undefined);
  if (!status) throw new Error("Cannot update task: missing status.");

  const priorityRaw =
    (patch.priority as string) ??
    (typeof existing.priority === "string" ? existing.priority : undefined);
  if (!priorityRaw || !isTaskPriority(priorityRaw))
    throw new Error("Cannot update task: invalid or missing priority.");

  const projectId =
    (patch.projectId as string) ??
    (typeof existing.projectId === "string" ? existing.projectId : undefined);
  if (!projectId) throw new Error("Cannot update task: missing projectId.");

  const userId =
    patch.userId !== undefined
      ? patch.userId === null
        ? ""
        : (patch.userId as string)
      : typeof existing.userId === "string"
        ? existing.userId
        : undefined;

  const startDate = formatOptionalIso(
    patch.startDate !== undefined ? patch.startDate : existing.startDate,
  );
  const dueDate = formatOptionalIso(
    patch.dueDate !== undefined ? patch.dueDate : existing.dueDate,
  );

  const body: Record<string, string | number | undefined> = {
    title,
    description,
    status,
    priority: priorityRaw,
    projectId,
    position,
  };
  if (startDate !== undefined) body.startDate = startDate;
  if (dueDate !== undefined) body.dueDate = dueDate;
  if (userId !== undefined) body.userId = userId;
  return body;
}

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

/** El tablon de un aviso: el de un proyecto o el del espacio, uno de los dos. */
function announcementScopePath(args: {
  projectId?: string;
  workspaceId?: string;
}) {
  if (Boolean(args.projectId) === Boolean(args.workspaceId)) {
    throw new Error("Pass either projectId or workspaceId");
  }
  return args.projectId
    ? `/api/announcement/project/${encodeURIComponent(args.projectId)}`
    : `/api/announcement/workspace/${encodeURIComponent(args.workspaceId ?? "")}`;
}
const nullableOptionalIsoDateTimeSchema = isoDateTimeSchema
  .nullable()
  .optional();

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
const hexColorSchema = z
  .string()
  .regex(
    /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/,
    "Expected a hex color like #FF6600",
  );

/** Register Riuna's authenticated tool catalog on an MCP server adapter. */
export function registerMcpTools(
  server: McpToolRegistrar,
  baseUrl: string,
  token: string,
): void {
  const client = new ApiClient(baseUrl, token);
  const registerTool = <InputSchema extends z.ZodObject>(
    name: string,
    config: { description: string; inputSchema: InputSchema },
    callback: (args: z.output<InputSchema>) => Promise<McpToolResult>,
  ) =>
    server.registerTool(name, config, async (args) => {
      const parsed = config.inputSchema.safeParse(args);
      if (!parsed.success) {
        return errorResult(z.prettifyError(parsed.error));
      }
      return callback(parsed.data);
    });

  registerTool(
    "whoami",
    {
      description: "Return the current Riuna session and user.",
      inputSchema: z.object({}),
    },
    async () =>
      run(() => client.json("/api/auth/get-session", { method: "GET" })),
  );

  registerTool(
    "list_workspaces",
    {
      description: "List workspaces the signed-in user can access.",
      inputSchema: z.object({}),
    },
    async () =>
      run(() => client.json("/api/auth/organization/list", { method: "GET" })),
  );

  registerTool(
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
        filter: z
          .string()
          .optional()
          .describe(
            'A filter as JSON, the same tree the views use, over the project: name, key, health (not_started, on_track, at_risk, off_track, finished, cancelled), lead (user id), startDate, endDate, createdAt, progress (0-100) and custom.<key> for the workspace\'s project fields. Example: {"type":"condition","field":"health","operator":"in","value":["at_risk","off_track"]}.',
          ),
      }),
    },
    async (args) => {
      const qs = new URLSearchParams({ workspaceId: args.workspaceId });
      if (args.includeArchived === true) qs.set("includeArchived", "true");
      if (args.filter) qs.set("filter", args.filter);
      return run(() =>
        client.json(`/api/project?${qs.toString()}`, { method: "GET" }),
      );
    },
  );

  registerTool(
    "get_project",
    {
      description: "Get a single project by ID.",
      inputSchema: z.object({ id: nonEmptyString }),
    },
    async (args) =>
      run(() => client.json(`/api/project/${encodeURIComponent(args.id)}`)),
  );

  registerTool(
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

  registerTool(
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
        if (!name) throw new Error("Cannot update project: missing name.");
        const icon =
          patch.icon !== undefined
            ? patch.icon
            : typeof existing.icon === "string"
              ? existing.icon
              : "Layout";
        const slug =
          patch.slug ??
          (typeof existing.slug === "string" ? existing.slug : "");
        if (!slug) throw new Error("Cannot update project: missing slug.");
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
        return client.json(`/api/project/${encodeURIComponent(id)}`, {
          method: "PUT",
          body: JSON.stringify({ name, icon, slug, description, isPublic }),
        });
      });
    },
  );

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

  registerTool(
    "list_tasks",
    {
      description: "List tasks for a project (optionally filtered/sorted).",
      inputSchema: z.object({
        projectId: nonEmptyString,
        status: optionalNonEmptyString,
        priority: prioritySchema.optional(),
        assigneeId: optionalNonEmptyString,
        page: z.number().int().positive().optional(),
        limit: z.number().int().positive().optional(),
        sortBy: z
          .enum([
            "createdAt",
            "priority",
            "dueDate",
            "position",
            "title",
            "number",
          ])
          .optional(),
        sortOrder: z.enum(["asc", "desc"]).optional(),
        dueBefore: optionalIsoDateTimeSchema,
        dueAfter: optionalIsoDateTimeSchema,
        filter: z
          .string()
          .optional()
          .describe(
            'A filter as JSON, the same the views use: {"type":"condition","field":"custom.presupuesto","operator":"gt","value":1000}, or several combined with {"type":"and","children":[…]} or {"type":"or","children":[…]}, and negated with {"type":"not","child":…}. Fields: title, description, status, priority, number, dueDate, assignee, team, done, completedAt, epic, assignees and watchers (by id), label (by name) and custom.<key>.',
          ),
        treeScope: z
          .enum(["matching", "roots", "withDescendants"])
          .optional()
          .describe(
            "With a filter: only the tasks that match, only the top-level ones, or the matches with their whole branch.",
          ),
      }),
    },
    async (args) => {
      const { projectId, ...rest } = args;
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(rest)) {
        if (v !== undefined && v !== null) qs.set(k, String(v));
      }
      const q = qs.toString();
      return run(() =>
        client.json(
          `/api/task/tasks/${encodeURIComponent(projectId)}${q ? `?${q}` : ""}`,
          { method: "GET" },
        ),
      );
    },
  );

  registerTool(
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

  registerTool(
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
        isMilestone: z
          .boolean()
          .optional()
          .describe(
            "A milestone: a single date (its due date), no estimate and no subtasks.",
          ),
        ...taskExtrasShape,
      }),
    },
    async (args) => {
      const { customFields, assigneeIds, teamId } = args;
      const extras: TaskExtras = { customFields, assigneeIds, teamId };
      const body: Record<string, string | boolean | undefined> = {
        title: args.title,
        description: args.description,
        priority: args.priority,
        status: args.status,
      };
      if (args.isMilestone !== undefined) body.isMilestone = args.isMilestone;
      if (args.startDate !== undefined) body.startDate = args.startDate;
      if (args.dueDate !== undefined) body.dueDate = args.dueDate;
      if (args.userId !== undefined) body.userId = args.userId;
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

  registerTool(
    "update_task",
    {
      description:
        "Update a task (fetches current task, merges fields, then full update).",
      inputSchema: z.object({
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
      }),
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

  registerTool(
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

  registerTool(
    "update_task_status",
    {
      description: "Update only the status (column) of a task.",
      inputSchema: z.object({ taskId: nonEmptyString, status: nonEmptyString }),
    },
    async (args) =>
      run(() =>
        client.json(`/api/task/status/${encodeURIComponent(args.taskId)}`, {
          method: "PUT",
          body: JSON.stringify({ status: args.status }),
        }),
      ),
  );

  registerTool(
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

  registerTool(
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

  registerTool(
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

  registerTool(
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

  registerTool(
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

  registerTool(
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

  registerTool(
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

  registerTool(
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

  registerTool(
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

  registerTool(
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

  registerTool(
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

  registerTool(
    "create_task_relation",
    {
      description:
        "Create a relation between two tasks. relationType: 'blocks' (sourceTaskId blocks targetTaskId), 'related' (bidirectional) or 'precedes' (sourceTaskId precedes targetTaskId: the target switches to automatic dates and starts the working day after the source ends, plus lag working days, negative to overlap; same project only). Parent/child hierarchy is not a relation: use update_task_parent.",
      inputSchema: z.object({
        sourceTaskId: nonEmptyString,
        targetTaskId: nonEmptyString,
        relationType: z.enum(["blocks", "related", "precedes"]),
        lag: z.number().int().min(-365).max(365).optional(),
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
            ...(args.lag !== undefined ? { lag: args.lag } : {}),
          }),
        }),
      ),
  );

  registerTool(
    "get_task_relations",
    {
      description:
        "List all relations (blocks, related, precedes with its lag) involving a task.",
      inputSchema: z.object({ taskId: nonEmptyString }),
    },
    async (args) =>
      run(() =>
        client.json(`/api/task-relation/${encodeURIComponent(args.taskId)}`, {
          method: "GET",
        }),
      ),
  );

  registerTool(
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

  registerTool(
    "get_task_watchers",
    {
      description:
        "Who watches a task. Assignees always do (assignee: true); watching: true means the person watches it on purpose, which is what unwatch_task removes. Watchers get the task's comments and status and due date changes as notifications.",
      inputSchema: z.object({ taskId: nonEmptyString }),
    },
    async (args) =>
      run(() =>
        client.json(`/api/task-watcher/${encodeURIComponent(args.taskId)}`, {
          method: "GET",
        }),
      ),
  );

  registerTool(
    "watch_task",
    {
      description:
        "Watch a task so its comments and status and due date changes arrive as notifications. Without userId it is the current user; adding someone else needs the task:assign permission and a workspace member. Returns the watchers.",
      inputSchema: z.object({
        taskId: nonEmptyString,
        userId: nonEmptyString.optional(),
      }),
    },
    async (args) =>
      run(() =>
        client.json(`/api/task-watcher/${encodeURIComponent(args.taskId)}`, {
          method: "POST",
          body: JSON.stringify(args.userId ? { userId: args.userId } : {}),
        }),
      ),
  );

  registerTool(
    "unwatch_task",
    {
      description:
        "Stop watching a task. Without userId it is the current user; removing someone else needs task:assign. An assignee keeps getting notified while assigned. Returns the watchers.",
      inputSchema: z.object({
        taskId: nonEmptyString,
        userId: nonEmptyString.optional(),
      }),
    },
    async (args) =>
      run(() =>
        client.json(
          `/api/task-watcher/${encodeURIComponent(args.taskId)}${
            args.userId ? `?userId=${encodeURIComponent(args.userId)}` : ""
          }`,
          { method: "DELETE" },
        ),
      ),
  );

  registerTool(
    "set_task_reminder",
    {
      description:
        "Remind the current user about a task at remindAt (an ISO date-time within a year), once, through the bell and their channels, with an optional private note. Replaces any reminder they already had on the task; leaving note out keeps its note. It does not plan the task into their day.",
      inputSchema: z.object({
        taskId: nonEmptyString,
        remindAt: isoDateTimeSchema,
        note: z.string().max(280).nullable().optional(),
      }),
    },
    async (args) =>
      run(() =>
        client.json(`/api/task-reminder/${encodeURIComponent(args.taskId)}`, {
          method: "PUT",
          body: JSON.stringify({
            remindAt: args.remindAt,
            ...(args.note !== undefined ? { note: args.note } : {}),
          }),
        }),
      ),
  );

  registerTool(
    "clear_task_reminder",
    {
      description: "Remove the current user's reminder on a task, if any.",
      inputSchema: z.object({ taskId: nonEmptyString }),
    },
    async (args) =>
      run(() =>
        client.json(`/api/task-reminder/${encodeURIComponent(args.taskId)}`, {
          method: "DELETE",
        }),
      ),
  );

  registerTool(
    "list_task_actions",
    {
      description:
        "The one-click actions a task offers right now: automations with the manual trigger whose conditions the task meets. Empty for whoever cannot edit tasks.",
      inputSchema: z.object({ taskId: nonEmptyString }),
    },
    async (args) =>
      run(() =>
        client.json(
          `/api/automation/manual/task/${encodeURIComponent(args.taskId)}`,
          { method: "GET" },
        ),
      ),
  );

  registerTool(
    "run_task_action",
    {
      description:
        "Press a one-click action (from list_task_actions) on a task. Its actions run on behalf of the current user. Returns ok, or failed with the action that stopped it.",
      inputSchema: z.object({
        taskId: nonEmptyString,
        automationId: nonEmptyString,
      }),
    },
    async (args) =>
      run(() =>
        client.json(
          `/api/automation/manual/task/${encodeURIComponent(args.taskId)}`,
          {
            method: "POST",
            body: JSON.stringify({ automationId: args.automationId }),
          },
        ),
      ),
  );

  registerTool(
    "get_task_totals",
    {
      description:
        "Totals over every task of a project that matches a filter (the same filter and treeScope as list_tasks): how many, their own estimate and logged time in seconds, and the sum of each number or currency field by key.",
      inputSchema: z.object({
        projectId: nonEmptyString,
        filter: z.string().optional(),
        treeScope: z.enum(["matching", "roots", "withDescendants"]).optional(),
      }),
    },
    async (args) => {
      const qs = new URLSearchParams();
      if (args.filter) qs.set("filter", args.filter);
      if (args.treeScope) qs.set("treeScope", args.treeScope);
      const q = qs.toString();
      return run(() =>
        client.json(
          `/api/task/tasks/${encodeURIComponent(args.projectId)}/totals${q ? `?${q}` : ""}`,
          { method: "GET" },
        ),
      );
    },
  );

  registerTool(
    "list_announcements",
    {
      description:
        "Announcements of a project (projectId) or of the workspace itself (workspaceId): pinned ones first, then newest first.",
      inputSchema: z.object({
        projectId: nonEmptyString.optional(),
        workspaceId: nonEmptyString.optional(),
      }),
    },
    async (args) =>
      run(() => client.json(announcementScopePath(args), { method: "GET" })),
  );

  registerTool(
    "post_announcement",
    {
      description:
        "Publish an announcement in a project (needs project:update) or in the workspace (needs workspace:manage_settings). Content is Markdown. pinned shows it as a banner in the project's views, until pinnedUntil if given. With notify (the default) every workspace member gets a notification.",
      inputSchema: z.object({
        projectId: nonEmptyString.optional(),
        workspaceId: nonEmptyString.optional(),
        title: z.string().min(1).max(200),
        content: z.string().max(20_000).optional(),
        pinned: z.boolean().optional(),
        pinnedUntil: optionalIsoDateTimeSchema,
        notify: z.boolean().optional(),
      }),
    },
    async (args) => {
      const { projectId, workspaceId, ...body } = args;
      return run(() =>
        client.json(announcementScopePath({ projectId, workspaceId }), {
          method: "POST",
          body: JSON.stringify(body),
        }),
      );
    },
  );

  registerTool(
    "set_task_milestone",
    {
      description:
        "Mark or unmark a task as a milestone: a single date (its start becomes its due date), no estimate and no subtasks. A task with subtasks cannot be one.",
      inputSchema: z.object({
        taskId: nonEmptyString,
        isMilestone: z.boolean(),
      }),
    },
    async (args) =>
      run(() =>
        client.json(`/api/task/milestone/${encodeURIComponent(args.taskId)}`, {
          method: "PUT",
          body: JSON.stringify({ isMilestone: args.isMilestone }),
        }),
      ),
  );
  registerTool(
    "set_task_auto_dates",
    {
      description:
        "Own or automatic dates for a task. With automatic dates a parent takes its start and due date from its branch and they stop being editable by hand; switching back keeps the ones it had.",
      inputSchema: z.object({
        taskId: nonEmptyString,
        autoDates: z.boolean(),
      }),
    },
    async (args) =>
      run(() =>
        client.json(`/api/task/auto-dates/${encodeURIComponent(args.taskId)}`, {
          method: "PUT",
          body: JSON.stringify({ autoDates: args.autoDates }),
        }),
      ),
  );

  registerTool(
    "shift_task_branch",
    {
      description:
        "Move a task and its whole branch the same number of working days (Monday to Friday, skipping the workspace holidays); negative moves it earlier.",
      inputSchema: z.object({
        taskId: nonEmptyString,
        workDays: z.number().int().min(-365).max(365),
      }),
    },
    async (args) =>
      run(() =>
        client.json(
          `/api/task/shift-branch/${encodeURIComponent(args.taskId)}`,
          {
            method: "POST",
            body: JSON.stringify({ workDays: args.workDays }),
          },
        ),
      ),
  );

  registerTool(
    "set_task_relation_lag",
    {
      description:
        "Change the lag of a 'precedes' relation, in working days (negative to overlap), and reschedule its successor.",
      inputSchema: z.object({
        relationId: nonEmptyString,
        lag: z.number().int().min(-365).max(365),
      }),
    },
    async (args) =>
      run(() =>
        client.json(
          `/api/task-relation/${encodeURIComponent(args.relationId)}/lag`,
          { method: "PATCH", body: JSON.stringify({ lag: args.lag }) },
        ),
      ),
  );

  registerTool(
    "compare_task_baseline",
    {
      description:
        "Compare a project's tasks (optionally a filter and treeScope, as in list_tasks) with how they were at an earlier moment `at` (ISO date-time): which entered or left the filter and the previous title, status, priority, assignee, dates and estimate of the ones that changed. Rebuilt from the activity; memberships count as they are now.",
      inputSchema: z.object({
        projectId: nonEmptyString,
        at: isoDateTimeSchema,
        filter: z.string().optional(),
        treeScope: z.enum(["matching", "roots", "withDescendants"]).optional(),
      }),
    },
    async (args) => {
      const qs = new URLSearchParams({ at: args.at });
      if (args.filter) qs.set("filter", args.filter);
      if (args.treeScope) qs.set("treeScope", args.treeScope);
      return run(() =>
        client.json(
          `/api/task/tasks/${encodeURIComponent(args.projectId)}/baseline?${qs}`,
          { method: "GET" },
        ),
      );
    },
  );

  registerTool(
    "set_project_status",
    {
      description:
        "Set a project's status: its health (not_started, on_track, at_risk, off_track, finished or cancelled) with a short note, its own start and end dates (ISO, or null to clear) and its lead (a workspace member's user id, or null). Only what is sent changes. With notify, a change of health is announced to the whole workspace.",
      inputSchema: z.object({
        projectId: nonEmptyString,
        health: z
          .enum([
            "not_started",
            "on_track",
            "at_risk",
            "off_track",
            "finished",
            "cancelled",
          ])
          .optional(),
        note: z.string().max(500).nullable().optional(),
        startDate: z.string().nullable().optional(),
        endDate: z.string().nullable().optional(),
        leadUserId: z.string().nullable().optional(),
        notify: z.boolean().optional(),
      }),
    },
    async (args) => {
      const { projectId, ...body } = args;
      return run(() =>
        client.json(`/api/project/${encodeURIComponent(projectId)}/status`, {
          method: "PATCH",
          body: JSON.stringify(body),
        }),
      );
    },
  );

  registerTool(
    "set_project_fields",
    {
      description:
        "Write values of the workspace's project fields on a project (custom fields defined for projects, not tasks). Partial: only the keys sent change, and an empty value clears one.",
      inputSchema: z.object({
        projectId: nonEmptyString,
        values: z.record(z.string(), z.unknown()),
      }),
    },
    async (args) =>
      run(() =>
        client.json(
          `/api/project/${encodeURIComponent(args.projectId)}/custom-fields`,
          { method: "PUT", body: JSON.stringify({ values: args.values }) },
        ),
      ),
  );

  registerTool(
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

  registerTool(
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

  registerTool(
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

  registerTool(
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

  registerTool(
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

  registerTool(
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

  registerTool(
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

  registerTool(
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

  registerTool(
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

  registerTool(
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

  registerTool(
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

  registerTool(
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

  registerTool(
    "get_time_entry",
    {
      description: "Get a single time entry by ID.",
      inputSchema: z.object({ id: nonEmptyString }),
    },
    async (args) =>
      run(() => client.json(`/api/time-entry/${encodeURIComponent(args.id)}`)),
  );

  registerTool(
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

  registerTool(
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

  registerTool(
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

  registerTool(
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

  registerTool(
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

  registerTool(
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

  registerTool(
    "list_notifications",
    {
      description: "List the signed-in user's notifications.",
      inputSchema: z.object({}),
    },
    async () => run(() => client.json("/api/notification")),
  );
}
