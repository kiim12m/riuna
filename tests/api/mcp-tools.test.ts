import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type McpToolRegistrar,
  registerMcpTools,
} from "../../apps/api/src/mcp/tools";

type ToolCallback = (args: unknown) => Promise<{
  content: Array<{ text: string }>;
  isError?: boolean;
}>;

function collectTools() {
  const tools = new Map<string, ToolCallback>();
  const registrar: McpToolRegistrar = {
    registerTool: (name, _config, callback) => tools.set(name, callback),
  };
  registerMcpTools(registrar, "http://api.test", "test-token");
  return tools;
}

const tools = collectTools();

function call(name: string, args: unknown = {}) {
  const tool = tools.get(name);
  if (!tool) throw new Error(`Tool ${name} is not registered`);
  return tool(args);
}

let apiFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  apiFetch = vi.fn(async () => Response.json({ ok: true }));
  vi.stubGlobal("fetch", apiFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function lastRequest() {
  const [input, init] = apiFetch.mock.calls.at(-1) as [
    RequestInfo | URL,
    RequestInit | undefined,
  ];
  return {
    url: String(input),
    method: init?.method ?? "GET",
    body: init?.body ? JSON.parse(String(init.body)) : undefined,
    auth: new Headers(init?.headers).get("authorization"),
  };
}

describe("MCP tool catalog", () => {
  it("resolves workspace members", async () => {
    await call("list_workspace_members", { workspaceId: "ws 1" });

    const request = lastRequest();
    expect(request.url).toBe("http://api.test/api/workspace/ws%201/members");
    expect(request.auth).toBe("Bearer test-token");
  });

  it("passes only the search filters that were supplied", async () => {
    await call("search", { q: "login bug" });
    expect(lastRequest().url).toBe("http://api.test/api/search?q=login+bug");

    await call("search", {
      q: "login bug",
      type: "tasks",
      projectId: "p1",
      limit: 5,
    });
    const url = new URL(lastRequest().url);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      q: "login bug",
      type: "tasks",
      projectId: "p1",
      limit: "5",
    });
  });

  it("rejects a search limit above the API maximum", async () => {
    const result = await call("search", { q: "x", limit: 500 });

    expect(result.isError).toBe(true);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("lists the columns whose slugs are valid task statuses", async () => {
    await call("list_project_columns", { projectId: "p1" });

    expect(lastRequest().url).toBe("http://api.test/api/column/p1");
  });

  it("deletes a task", async () => {
    await call("delete_task", { taskId: "t1" });

    expect(lastRequest()).toMatchObject({
      url: "http://api.test/api/task/t1",
      method: "DELETE",
    });
  });

  it("assigns and unassigns a task", async () => {
    await call("update_task_assignee", { taskId: "t1", userId: "u1" });
    expect(lastRequest()).toMatchObject({
      url: "http://api.test/api/task/assignee/t1",
      method: "PUT",
      body: { userId: "u1" },
    });

    await call("update_task_assignee", { taskId: "t1", userId: null });
    expect(lastRequest().body).toEqual({ userId: null });
  });

  it("rejects an empty assignee id rather than sending it", async () => {
    const result = await call("update_task_assignee", {
      taskId: "t1",
      userId: "",
    });

    expect(result.isError).toBe(true);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("sets and clears a due date", async () => {
    await call("update_task_due_date", {
      taskId: "t1",
      dueDate: "2026-09-01T10:00:00Z",
    });
    expect(lastRequest()).toMatchObject({
      url: "http://api.test/api/task/due-date/t1",
      method: "PUT",
      body: { dueDate: "2026-09-01T10:00:00Z" },
    });

    await call("update_task_due_date", { taskId: "t1" });
    expect(lastRequest().body).toEqual({});
  });

  it("rejects a due date that is not an ISO date-time", async () => {
    const result = await call("update_task_due_date", {
      taskId: "t1",
      dueDate: "next tuesday",
    });

    expect(result.isError).toBe(true);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("reads time entries for a task and by id", async () => {
    await call("list_task_time_entries", { taskId: "t1" });
    expect(lastRequest().url).toBe("http://api.test/api/time-entry/task/t1");

    await call("get_time_entry", { id: "te1" });
    expect(lastRequest().url).toBe("http://api.test/api/time-entry/te1");
  });

  it("creates a running time entry when endTime is omitted", async () => {
    await call("create_time_entry", {
      taskId: "t1",
      startTime: "2026-08-10T09:00:00Z",
    });

    expect(lastRequest()).toMatchObject({
      url: "http://api.test/api/time-entry",
      method: "POST",
      body: { taskId: "t1", startTime: "2026-08-10T09:00:00Z" },
    });
    expect(lastRequest().body).not.toHaveProperty("endTime");
  });

  it("updates a time entry", async () => {
    await call("update_time_entry", {
      id: "te1",
      startTime: "2026-08-10T09:00:00Z",
      endTime: "2026-08-10T10:30:00Z",
      description: "pairing",
    });

    expect(lastRequest()).toMatchObject({
      url: "http://api.test/api/time-entry/te1",
      method: "PUT",
      body: {
        startTime: "2026-08-10T09:00:00Z",
        endTime: "2026-08-10T10:30:00Z",
        description: "pairing",
      },
    });
  });

  it("reads task activity and notifications", async () => {
    await call("list_task_activity", { taskId: "t1" });
    expect(lastRequest().url).toBe("http://api.test/api/activity/t1");

    await call("list_notifications");
    expect(lastRequest().url).toBe("http://api.test/api/notification");
  });

  it("surfaces an API failure as a tool error", async () => {
    apiFetch.mockResolvedValueOnce(
      Response.json({ message: "Task not found" }, { status: 404 }),
    );

    const result = await call("delete_task", { taskId: "missing" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Task not found");
  });
});

describe("MCP tasks with assignees, team and custom fields", () => {
  /** Cada peticion al API, en orden: metodo, ruta y cuerpo. */
  function calls() {
    return apiFetch.mock.calls.map(([input, init]) => {
      const request = init as RequestInit | undefined;
      return [
        request?.method ?? "GET",
        new URL(String(input)).pathname,
        request?.body ? JSON.parse(String(request.body)) : undefined,
      ] as const;
    });
  }

  beforeEach(() => {
    apiFetch.mockImplementation(async (input, init) => {
      const method = (init as RequestInit | undefined)?.method ?? "GET";
      const path = new URL(String(input)).pathname;
      if (method === "POST" && path === "/api/task/p1") {
        return Response.json({ id: "t9", title: "Nueva" });
      }
      // Una tarea completa: `update_task` la lee y la reescribe entera.
      return Response.json({
        id: "t9",
        title: "Nueva",
        description: "",
        status: "to-do",
        priority: "medium",
        projectId: "p1",
        position: 1,
        customFields: {},
      });
    });
  });

  it("creates the task and then saves what has its own route, answering the task as it ended up", async () => {
    const result = await call("create_task", {
      projectId: "p1",
      title: "Nueva",
      description: "",
      priority: "medium",
      status: "to-do",
      assigneeIds: ["u1", "u2"],
      teamId: "team-1",
      customFields: { presupuesto: 1500 },
    });

    expect(calls().map(([method, path]) => `${method} ${path}`)).toEqual([
      "POST /api/task/p1",
      "PUT /api/task/assignees/t9",
      "PUT /api/task/team/t9",
      "PUT /api/task/custom-fields/t9",
      "GET /api/task/t9",
    ]);
    const byPath = new Map(calls().map(([, path, body]) => [path, body]));
    expect(byPath.get("/api/task/assignees/t9")).toEqual({
      userIds: ["u1", "u2"],
    });
    expect(byPath.get("/api/task/team/t9")).toEqual({ teamId: "team-1" });
    expect(byPath.get("/api/task/custom-fields/t9")).toEqual({
      values: { presupuesto: 1500 },
    });
    // Los extras no viajan en el POST de la tarea.
    expect(byPath.get("/api/task/p1")).not.toHaveProperty("customFields");
    expect(result.isError).toBeFalsy();
  });

  it("makes one request, as before, when none of them is asked", async () => {
    await call("create_task", {
      projectId: "p1",
      title: "Sola",
      description: "",
      priority: "low",
      status: "to-do",
    });

    expect(calls()).toHaveLength(1);
  });

  it("says the task was saved when the assignees are refused", async () => {
    apiFetch.mockImplementation(async (input, init) => {
      const method = (init as RequestInit | undefined)?.method ?? "GET";
      const path = new URL(String(input)).pathname;
      if (method === "POST" && path === "/api/task/p1") {
        return Response.json({ id: "t9" });
      }
      return new Response("Insufficient permissions", { status: 403 });
    });

    const result = await call("create_task", {
      projectId: "p1",
      title: "Nueva",
      description: "",
      priority: "medium",
      status: "to-do",
      assigneeIds: ["u1"],
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Task t9 was saved");
  });

  it("updates a task and its extras, keeping the extras out of the full update", async () => {
    await call("update_task", {
      taskId: "t1",
      title: "Renombrada",
      teamId: null,
      customFields: { cliente: "Acme" },
    });

    const sent = calls();
    expect(sent.map(([method, path]) => `${method} ${path}`)).toEqual([
      "GET /api/task/t1",
      "PUT /api/task/t1",
      "PUT /api/task/team/t1",
      "PUT /api/task/custom-fields/t1",
      "GET /api/task/t1",
    ]);
    const full = sent[1]?.[2] as Record<string, unknown>;
    expect(full.title).toBe("Renombrada");
    expect(full).not.toHaveProperty("customFields");
    expect(full).not.toHaveProperty("teamId");
    expect(sent[2]?.[2]).toEqual({ teamId: null });
  });

  it("lists tasks by a filter on a custom field", async () => {
    const filter = JSON.stringify({
      type: "condition",
      field: "custom.presupuesto",
      operator: "gt",
      value: 1000,
    });

    await call("list_tasks", {
      projectId: "p1",
      filter,
      treeScope: "withDescendants",
    });

    const url = new URL(lastRequest().url);
    expect(url.pathname).toBe("/api/task/tasks/p1");
    expect(url.searchParams.get("filter")).toBe(filter);
    expect(url.searchParams.get("treeScope")).toBe("withDescendants");
  });
});
