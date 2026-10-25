import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { proposeMapping } from "../../apps/api/src/task/exchange/map-rows";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
  taskTreeValues,
} from "./helpers/fixtures";

beforeEach(async () => {
  await resetTestDatabase();
});

describe("project integration routes are workspace scoped", () => {
  it("refuses to create an integration for a member without manage_settings", async () => {
    const { user, workspace } = await createWorkspaceMember({ role: "member" });
    const { project } = await createProjectFixture({
      workspaceId: workspace.id,
    });

    mockAuthenticatedSession(user);
    const { app } = createApp();

    const response = await app.request(
      `/api/discord-integration/project/${project.id}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          webhookUrl: "https://discord.com/api/webhooks/1/abc",
        }),
      },
    );

    expect(response.status).toBe(403);
  });

  it("refuses to read the integration of a project in another workspace", async () => {
    const outsider = await createWorkspaceMember({ role: "owner" });
    const other = await createWorkspaceMember({ role: "owner" });
    const { project } = await createProjectFixture({
      workspaceId: other.workspace.id,
    });

    mockAuthenticatedSession(outsider.user);
    const { app } = createApp();

    const response = await app.request(
      `/api/discord-integration/project/${project.id}`,
    );

    expect(response.status).toBe(403);
  });
});

describe("public project route", () => {
  it("refuses a project that is not public", async () => {
    const { workspace } = await createWorkspaceMember();
    const { project } = await createProjectFixture({
      workspaceId: workspace.id,
    });

    const { app } = createApp();
    const response = await app.request(`/api/public-project/${project.id}`);

    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain(project.name);
  });

  // Esta ruta se sirve sin sesion, asi que hereda todo lo que se anada al
  // listado interno. Las Fases 2 y 3 le colaron los campos personalizados, las
  // epicas, el equipo, la estimacion y la forma del arbol sin que nadie
  // revisara quien mas llamaba a `getTasks`.
  it("does not leak internal fields that the task list happens to carry", async () => {
    const { workspace } = await createWorkspaceMember();
    const { project, columns } = await createProjectFixture({
      workspaceId: workspace.id,
    });

    await db
      .update(schema.projectTable)
      .set({ isPublic: true })
      .where(eq(schema.projectTable.id, project.id));

    await db.insert(schema.fieldDefinitionTable).values({
      workspaceId: workspace.id,
      projectId: project.id,
      key: "presupuesto",
      name: "Presupuesto",
      type: "number",
      config: {},
    });

    const [team] = await db
      .insert(schema.teamTable)
      .values({
        id: `team-${randomUUID()}`,
        workspaceId: workspace.id,
        name: "Legal",
        createdAt: new Date(),
      })
      .returning();

    const tree = taskTreeValues();
    const [task] = await db
      .insert(schema.taskTable)
      .values({
        ...tree,
        projectId: project.id,
        columnId: columns.todo.id,
        title: "Obra publica",
        status: "to-do",
        priority: "medium",
        number: 1,
        position: 0,
        teamId: team.id,
        estimate: 7200,
        customFields: { presupuesto: 50000 },
      })
      .returning();

    const [epic] = await db
      .insert(schema.epicTable)
      .values({
        projectId: project.id,
        name: "Secreta",
        color: "#123456",
        position: 0,
      })
      .returning();

    await db
      .insert(schema.taskEpicTable)
      .values({ taskId: task.id, epicId: epic.id });

    const { app } = createApp();
    const response = await app.request(`/api/public-project/${project.id}`);

    expect(response.status).toBe(200);
    const body = await response.text();

    // Lo que si se ensena: es un tablero publico.
    expect(body).toContain("Obra publica");

    // Y lo que no.
    for (const leaked of [
      "presupuesto",
      "customFields",
      "Secreta",
      "epics",
      "Legal",
      "teamId",
      "estimate",
      "workspaceId",
      "maxTaskDepth",
      tree.path,
    ]) {
      expect(body).not.toContain(leaked);
    }
  });
});

describe("task assignees stay inside the workspace", () => {
  it("refuses to create a task assigned to a non-member", async () => {
    const { user, workspace } = await createWorkspaceMember({ role: "owner" });
    const outsider = await createWorkspaceMember({ role: "owner" });
    const { project } = await createProjectFixture({
      workspaceId: workspace.id,
    });

    mockAuthenticatedSession(user);
    const { app } = createApp();

    const response = await app.request(`/api/task/${project.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Cross-workspace assignment",
        description: "",
        priority: "low",
        status: "to-do",
        userId: outsider.user.id,
      }),
    });

    expect(response.status).toBe(403);
  });

  it("refuses to reassign an existing task to a non-member", async () => {
    const { user, workspace } = await createWorkspaceMember({ role: "owner" });
    const outsider = await createWorkspaceMember({ role: "owner" });
    const { project, columns } = await createProjectFixture({
      workspaceId: workspace.id,
    });

    const [task] = await db
      .insert(schema.taskTable)
      .values({
        ...taskTreeValues(),
        projectId: project.id,
        title: "Seeded",
        description: "",
        priority: "low",
        status: "to-do",
        columnId: columns.todo?.id ?? null,
        number: 1,
        position: 1,
      })
      .returning();

    mockAuthenticatedSession(user);
    const { app } = createApp();

    const response = await app.request(`/api/task/assignee/${task.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: outsider.user.id }),
    });

    expect(response.status).toBe(403);
  });
});

describe("activity attribution", () => {
  it("credits the session user, not a userId supplied in the body", async () => {
    const { user, workspace } = await createWorkspaceMember({ role: "owner" });
    const impersonated = await createWorkspaceMember({ role: "owner" });
    const { project, columns } = await createProjectFixture({
      workspaceId: workspace.id,
    });

    const [task] = await db
      .insert(schema.taskTable)
      .values({
        ...taskTreeValues(),
        projectId: project.id,
        title: "Seeded",
        description: "",
        priority: "low",
        status: "to-do",
        columnId: columns.todo?.id ?? null,
        number: 1,
        position: 1,
      })
      .returning();

    mockAuthenticatedSession(user);
    const { app } = createApp();

    const response = await app.request("/api/activity/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        taskId: task.id,
        userId: impersonated.user.id,
        message: `note-${randomUUID()}`,
        type: "created",
      }),
    });

    expect(response.status).toBe(200);
    const activity = await response.json();
    expect(activity.userId).toBe(user.id);
    expect(activity.userId).not.toBe(impersonated.user.id);
  });
});

describe("every assignee write path is workspace scoped", () => {
  // El importador dejo de aceptar JSON `{ tasks: [...] }` en la Fase 5 (ADR 017):
  // ahora es multipart con un CSV y su mapeo de columnas.
  function importForm(rows: string[][]) {
    const headers = ["Título", "Estado", "Responsable"];
    const content = `﻿${[headers, ...rows]
      .map((cells) => cells.join(","))
      .join("\r\n")}\r\n`;
    const form = new FormData();
    form.append(
      "file",
      new File([content], "import.csv", { type: "text/csv" }),
    );
    form.append("mapping", JSON.stringify(proposeMapping(headers)));
    return form;
  }

  it("refuses a non-member through the task update endpoint", async () => {
    const { user, workspace } = await createWorkspaceMember({ role: "owner" });
    const outsider = await createWorkspaceMember({ role: "owner" });
    const { project, columns } = await createProjectFixture({
      workspaceId: workspace.id,
    });

    const [task] = await db
      .insert(schema.taskTable)
      .values({
        ...taskTreeValues(),
        projectId: project.id,
        title: "Seeded",
        description: "",
        priority: "low",
        status: "to-do",
        columnId: columns.todo?.id ?? null,
        number: 1,
        position: 1,
      })
      .returning();

    mockAuthenticatedSession(user);
    const { app } = createApp();

    const response = await app.request(`/api/task/${task.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Seeded",
        status: "to-do",
        projectId: project.id,
        description: "",
        priority: "low",
        position: 1,
        userId: outsider.user.id,
      }),
    });

    expect(response.status).toBe(403);
  });

  it("imports every row but drops an assignee who is not a member", async () => {
    const { user, workspace } = await createWorkspaceMember({ role: "owner" });
    const outsider = await createWorkspaceMember({ role: "owner" });
    const { project } = await createProjectFixture({
      workspaceId: workspace.id,
    });

    mockAuthenticatedSession(user);
    const { app } = createApp();

    const response = await app.request(`/api/task/import/${project.id}`, {
      method: "POST",
      body: importForm([
        ["Good", "To Do", ""],
        ["Bad", "To Do", outsider.user.email],
      ]),
    });

    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      results: {
        created: number;
        rows: { outcome: string; taskId: string; warnings?: string[] }[];
      };
    };

    expect(body.results.created).toBe(2);

    const stored = await db
      .select({
        title: schema.taskTable.title,
        userId: schema.taskTable.userId,
      })
      .from(schema.taskTable)
      .where(eq(schema.taskTable.projectId, project.id))
      .orderBy(schema.taskTable.number);

    expect(stored.map((t) => t.title)).toEqual(["Good", "Bad"]);
    expect(stored.find((t) => t.title === "Bad")?.userId).toBeNull();

    const warned = body.results.rows.filter((row) =>
      row.warnings?.some((warning) => warning.includes("not a member")),
    );
    expect(warned).toHaveLength(1);

    const outsiderLinks = await db
      .select({ taskId: schema.taskAssigneeTable.taskId })
      .from(schema.taskAssigneeTable)
      .where(eq(schema.taskAssigneeTable.userId, outsider.user.id));

    expect(outsiderLinks).toHaveLength(0);
  });

  it("does not assign a non-member through task import", async () => {
    const { user, workspace } = await createWorkspaceMember({ role: "owner" });
    const outsider = await createWorkspaceMember({ role: "owner" });
    const { project } = await createProjectFixture({
      workspaceId: workspace.id,
    });

    mockAuthenticatedSession(user);
    const { app } = createApp();

    const response = await app.request(`/api/task/import/${project.id}`, {
      method: "POST",
      body: importForm([["Imported", "To Do", outsider.user.email]]),
    });

    expect(response.status).toBe(200);

    const body = (await response.json()) as { results: { created: number } };
    expect(body.results.created).toBe(1);

    const [stored] = await db
      .select({ userId: schema.taskTable.userId })
      .from(schema.taskTable)
      .where(eq(schema.taskTable.projectId, project.id));

    expect(stored.userId).toBeNull();

    const outsiderLinks = await db
      .select({ taskId: schema.taskAssigneeTable.taskId })
      .from(schema.taskAssigneeTable)
      .where(eq(schema.taskAssigneeTable.userId, outsider.user.id));

    expect(outsiderLinks).toHaveLength(0);
  });

  it("resolves a padded assignee handle to the member", async () => {
    const { user, workspace } = await createWorkspaceMember({ role: "owner" });
    const { project } = await createProjectFixture({
      workspaceId: workspace.id,
    });

    mockAuthenticatedSession(user);
    const { app } = createApp();

    const response = await app.request(`/api/task/import/${project.id}`, {
      method: "POST",
      body: importForm([["Imported", "To Do", `  ${user.email}  `]]),
    });

    expect(response.status).toBe(200);

    const [stored] = await db
      .select({ userId: schema.taskTable.userId })
      .from(schema.taskTable)
      .where(eq(schema.taskTable.projectId, project.id));

    expect(stored.userId).toBe(user.id);
  });

  it("treats a whitespace-only assignee as an unassignment", async () => {
    const { user, workspace } = await createWorkspaceMember({ role: "owner" });
    const { project, columns } = await createProjectFixture({
      workspaceId: workspace.id,
    });

    const [task] = await db
      .insert(schema.taskTable)
      .values({
        ...taskTreeValues(),
        projectId: project.id,
        title: "Seeded",
        description: "",
        priority: "low",
        status: "to-do",
        columnId: columns.todo?.id ?? null,
        number: 1,
        position: 1,
        userId: user.id,
      })
      .returning();

    mockAuthenticatedSession(user);
    const { app } = createApp();

    const response = await app.request(`/api/task/assignee/${task.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "   " }),
    });

    expect(response.status).toBe(200);

    const [after] = await db
      .select({ userId: schema.taskTable.userId })
      .from(schema.taskTable)
      .where(eq(schema.taskTable.id, task.id));

    expect(after.userId).toBeNull();
  });

  it("assigns a padded but valid member id", async () => {
    const { user, workspace } = await createWorkspaceMember({ role: "owner" });
    const { project, columns } = await createProjectFixture({
      workspaceId: workspace.id,
    });

    const [task] = await db
      .insert(schema.taskTable)
      .values({
        ...taskTreeValues(),
        projectId: project.id,
        title: "Seeded",
        description: "",
        priority: "low",
        status: "to-do",
        columnId: columns.todo?.id ?? null,
        number: 1,
        position: 1,
      })
      .returning();

    mockAuthenticatedSession(user);
    const { app } = createApp();

    const response = await app.request(`/api/task/assignee/${task.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: `  ${user.id}  ` }),
    });

    expect(response.status).toBe(200);

    const [after] = await db
      .select({ userId: schema.taskTable.userId })
      .from(schema.taskTable)
      .where(eq(schema.taskTable.id, task.id));

    expect(after.userId).toBe(user.id);
  });

  it("refuses a non-member through the bulk assignee operation", async () => {
    const { user, workspace } = await createWorkspaceMember({ role: "owner" });
    const outsider = await createWorkspaceMember({ role: "owner" });
    const { project, columns } = await createProjectFixture({
      workspaceId: workspace.id,
    });

    const [task] = await db
      .insert(schema.taskTable)
      .values({
        ...taskTreeValues(),
        projectId: project.id,
        title: "Seeded",
        description: "",
        priority: "low",
        status: "to-do",
        columnId: columns.todo?.id ?? null,
        number: 1,
        position: 1,
      })
      .returning();

    mockAuthenticatedSession(user);
    const { app } = createApp();

    const response = await app.request("/api/task/bulk", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        taskIds: [task.id],
        operation: "updateAssignee",
        value: outsider.user.id,
      }),
    });

    expect(response.status).toBe(403);
  });
});
