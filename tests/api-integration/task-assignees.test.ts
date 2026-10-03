import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { proposeMapping } from "../../apps/api/src/task/exchange/map-rows";
import { mockAnonymousSession, mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
  taskTreeValues,
} from "./helpers/fixtures";

async function addWorkspaceMember(workspaceId: string, name: string) {
  const userId = `user-${randomUUID()}`;

  const [user] = await db
    .insert(schema.userTable)
    .values({
      id: userId,
      email: `${userId}@example.com`,
      emailVerified: true,
      name,
    })
    .returning();

  await db.insert(schema.workspaceUserTable).values({
    workspaceId,
    userId: user.id,
    role: "member",
    joinedAt: new Date(),
  });

  return user;
}

async function createTask(projectId: string, columnId: string) {
  const [task] = await db
    .insert(schema.taskTable)
    .values({
      ...taskTreeValues(),
      projectId,
      title: "Trabajo a varias manos",
      status: "to-do",
      columnId,
      priority: "medium",
      number: 1,
      position: 0,
    })
    .returning();

  return task;
}

async function readAssignees(taskId: string) {
  const rows = await db
    .select({ userId: schema.taskAssigneeTable.userId })
    .from(schema.taskAssigneeTable)
    .where(eq(schema.taskAssigneeTable.taskId, taskId))
    .orderBy(schema.taskAssigneeTable.createdAt);

  return rows.map((row) => row.userId);
}

async function readPrimaryAssignee(taskId: string) {
  const [task] = await db
    .select({ userId: schema.taskTable.userId })
    .from(schema.taskTable)
    .where(eq(schema.taskTable.id, taskId));

  return task?.userId ?? null;
}

describe("API integration: multiple task assignees", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  // Asignar exige `task:assign`. Lo tienen `member`, `admin` y `owner`;
  // `viewer` no.
  it("refuses a viewer, who has no assign permission", async () => {
    const member = await createWorkspaceMember({ role: "viewer" });
    const { project, columns } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const task = await createTask(project.id, columns.todo.id);

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request(`/api/task/assignees/${task.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userIds: [member.user.id] }),
    });

    expect(response.status).toBe(403);
    await expect(readAssignees(task.id)).resolves.toEqual([]);
  });

  it("lets a plain member replace the assignees of a task", async () => {
    const member = await createWorkspaceMember({ role: "member" });
    const { project, columns } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const task = await createTask(project.id, columns.todo.id);

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request(`/api/task/assignees/${task.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userIds: [member.user.id] }),
    });

    expect(response.status).toBe(200);
    await expect(readAssignees(task.id)).resolves.toEqual([member.user.id]);
  });

  it("rejects unauthenticated assignee replacement", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const { project, columns } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const task = await createTask(project.id, columns.todo.id);

    mockAnonymousSession();
    const { app } = createApp();

    const response = await app.request(`/api/task/assignees/${task.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userIds: [member.user.id] }),
    });

    expect(response.status).toBe(401);
    await expect(readAssignees(task.id)).resolves.toEqual([]);
  });

  // El contrato de la fase: `task.assignee_id` sigue siendo el responsable
  // principal y es el primero de la lista, para que todo lo heredado que lo
  // lee siga leyendo algo cierto.
  it("stores the full set and keeps the first one as primary assignee", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const second = await addWorkspaceMember(member.workspace.id, "Segunda");
    const third = await addWorkspaceMember(member.workspace.id, "Tercero");
    const { project, columns } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const task = await createTask(project.id, columns.todo.id);

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request(`/api/task/assignees/${task.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userIds: [member.user.id, second.id, third.id],
      }),
    });

    expect(response.status).toBe(200);

    const payload = (await response.json()) as { assigneeIds: string[] };
    // Se compara como conjunto: las tres filas entran en la misma sentencia y
    // `now()` es el de la transaccion, asi que comparten `created_at` y su
    // orden relativo no esta garantizado. Lo que si esta definido es quien
    // queda de responsable principal.
    expect([...payload.assigneeIds].sort()).toEqual(
      [member.user.id, second.id, third.id].sort(),
    );

    await expect(
      readAssignees(task.id).then((ids) => ids.sort()),
    ).resolves.toEqual([member.user.id, second.id, third.id].sort());
    await expect(readPrimaryAssignee(task.id)).resolves.toBe(member.user.id);
  });

  it("drops duplicates and blank ids instead of failing on the unique index", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const { project, columns } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const task = await createTask(project.id, columns.todo.id);

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request(`/api/task/assignees/${task.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userIds: [member.user.id, member.user.id, "   "],
      }),
    });

    expect(response.status).toBe(200);
    await expect(readAssignees(task.id)).resolves.toEqual([member.user.id]);
  });

  it("keeps the assignment order of the people who stay", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const second = await addWorkspaceMember(member.workspace.id, "Segunda");
    const { project, columns } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const task = await createTask(project.id, columns.todo.id);

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    await app.request(`/api/task/assignees/${task.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userIds: [member.user.id, second.id] }),
    });

    const [firstRow] = await db
      .select({ createdAt: schema.taskAssigneeTable.createdAt })
      .from(schema.taskAssigneeTable)
      .where(eq(schema.taskAssigneeTable.userId, member.user.id));

    const response = await app.request(`/api/task/assignees/${task.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userIds: [member.user.id] }),
    });

    expect(response.status).toBe(200);
    await expect(readAssignees(task.id)).resolves.toEqual([member.user.id]);

    const [keptRow] = await db
      .select({ createdAt: schema.taskAssigneeTable.createdAt })
      .from(schema.taskAssigneeTable)
      .where(eq(schema.taskAssigneeTable.userId, member.user.id));

    expect(keptRow.createdAt.getTime()).toBe(firstRow.createdAt.getTime());
  });

  it("clears the set and the primary assignee with an empty list", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const second = await addWorkspaceMember(member.workspace.id, "Segunda");
    const { project, columns } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const task = await createTask(project.id, columns.todo.id);

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    await app.request(`/api/task/assignees/${task.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userIds: [member.user.id, second.id] }),
    });

    const response = await app.request(`/api/task/assignees/${task.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userIds: [] }),
    });

    expect(response.status).toBe(200);
    await expect(readAssignees(task.id)).resolves.toEqual([]);
    await expect(readPrimaryAssignee(task.id)).resolves.toBeNull();
  });

  it("refuses the whole list when one of them is not a workspace member", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const stranger = await createWorkspaceMember({ role: "admin" });
    const { project, columns } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const task = await createTask(project.id, columns.todo.id);

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request(`/api/task/assignees/${task.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userIds: [member.user.id, stranger.user.id],
      }),
    });

    expect(response.status).toBe(403);
    await expect(readAssignees(task.id)).resolves.toEqual([]);
    await expect(readPrimaryAssignee(task.id)).resolves.toBeNull();
  });

  // Las dos vias de asignacion escriben la misma tabla: la heredada de un solo
  // responsable no puede dejar el conjunto desfasado.
  it("keeps the set in sync when the legacy single-assignee route writes", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const second = await addWorkspaceMember(member.workspace.id, "Segunda");
    const { project, columns } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const task = await createTask(project.id, columns.todo.id);

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const assigned = await app.request(`/api/task/assignee/${task.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: member.user.id }),
    });

    expect(assigned.status).toBe(200);
    await expect(readAssignees(task.id)).resolves.toEqual([member.user.id]);

    const reassigned = await app.request(`/api/task/assignee/${task.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: second.id }),
    });

    expect(reassigned.status).toBe(200);
    await expect(readAssignees(task.id)).resolves.toEqual([second.id]);
    await expect(readPrimaryAssignee(task.id)).resolves.toBe(second.id);
  });

  it("refuses a member of another workspace", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const stranger = await createWorkspaceMember({ role: "admin" });
    const { project, columns } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const task = await createTask(project.id, columns.todo.id);

    mockAuthenticatedSession(stranger.user);
    const { app } = createApp();

    const response = await app.request(`/api/task/assignees/${task.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userIds: [stranger.user.id] }),
    });

    expect(response.status).toBe(403);
    await expect(readAssignees(task.id)).resolves.toEqual([]);
  });

  // `assignees.ts` afirma ser el unico sitio que escribe `task_assignee`, y
  // durante cuatro fases no lo fue: crear, editar, el lote y la importacion
  // escribian `assignee_id` a pelo. El conjunto quedaba vacio con la tarjeta
  // mostrando un responsable, y un filtro por `assignees` no encontraba la
  // tarea. Un caso por via.
  describe("every writer of assignee_id keeps the set in sync", () => {
    it("creating a task with an assignee seeds the set", async () => {
      const member = await createWorkspaceMember({ role: "admin" });
      const { project } = await createProjectFixture({
        workspaceId: member.workspace.id,
      });

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await app.request(`/api/task/${project.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "Nace asignada",
          description: "",
          status: "to-do",
          priority: "medium",
          userId: member.user.id,
        }),
      });

      expect(response.status).toBe(200);
      const created = (await response.json()) as { id: string };

      await expect(readAssignees(created.id)).resolves.toEqual([
        member.user.id,
      ]);
      await expect(readPrimaryAssignee(created.id)).resolves.toBe(
        member.user.id,
      );
    });

    it("the generic task update moves the set with the primary assignee", async () => {
      const member = await createWorkspaceMember({ role: "admin" });
      const second = await addWorkspaceMember(member.workspace.id, "Segunda");
      const { project, columns } = await createProjectFixture({
        workspaceId: member.workspace.id,
      });
      const task = await createTask(project.id, columns.todo.id);

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const assigned = await app.request(`/api/task/${task.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: task.title,
          status: "to-do",
          projectId: project.id,
          description: "",
          priority: "medium",
          position: 0,
          userId: member.user.id,
        }),
      });

      expect(assigned.status).toBe(200);
      await expect(readAssignees(task.id)).resolves.toEqual([member.user.id]);

      const reassigned = await app.request(`/api/task/${task.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: task.title,
          status: "to-do",
          projectId: project.id,
          description: "",
          priority: "medium",
          position: 0,
          userId: second.id,
        }),
      });

      expect(reassigned.status).toBe(200);
      await expect(readAssignees(task.id)).resolves.toEqual([second.id]);
      await expect(readPrimaryAssignee(task.id)).resolves.toBe(second.id);
    });

    it("the bulk assignee operation moves the set for every task", async () => {
      const member = await createWorkspaceMember({ role: "admin" });
      const second = await addWorkspaceMember(member.workspace.id, "Segunda");
      const { project, columns } = await createProjectFixture({
        workspaceId: member.workspace.id,
      });

      const [first] = await db
        .insert(schema.taskTable)
        .values({
          ...taskTreeValues(),
          projectId: project.id,
          title: "Una",
          status: "to-do",
          columnId: columns.todo.id,
          priority: "medium",
          number: 1,
          position: 0,
          userId: member.user.id,
        })
        .returning();

      const [other] = await db
        .insert(schema.taskTable)
        .values({
          ...taskTreeValues(),
          projectId: project.id,
          title: "Otra",
          status: "to-do",
          columnId: columns.todo.id,
          priority: "medium",
          number: 2,
          position: 1,
        })
        .returning();

      await db.insert(schema.taskAssigneeTable).values({
        taskId: first.id,
        userId: member.user.id,
      });

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await app.request("/api/task/bulk", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          taskIds: [first.id, other.id],
          operation: "updateAssignee",
          value: second.id,
        }),
      });

      expect(response.status).toBe(200);

      await expect(readAssignees(first.id)).resolves.toEqual([second.id]);
      await expect(readAssignees(other.id)).resolves.toEqual([second.id]);
      await expect(readPrimaryAssignee(first.id)).resolves.toBe(second.id);
      await expect(readPrimaryAssignee(other.id)).resolves.toBe(second.id);
    });

    it("importing tasks seeds the set for each assigned row", async () => {
      const member = await createWorkspaceMember({ role: "admin" });
      const { project } = await createProjectFixture({
        workspaceId: member.workspace.id,
      });

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const headers = ["Título", "Estado", "Responsable"];
      const content = `﻿${[headers, ["Importada", "To Do", member.user.email]]
        .map((cells) => cells.join(","))
        .join("\r\n")}\r\n`;

      const form = new FormData();
      form.append(
        "file",
        new File([content], "import.csv", { type: "text/csv" }),
      );
      form.append("mapping", JSON.stringify(proposeMapping(headers)));

      const response = await app.request(`/api/task/import/${project.id}`, {
        method: "POST",
        body: form,
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        results: {
          created: number;
          rows: { outcome: string; taskId: string }[];
        };
      };

      expect(body.results.created).toBe(1);
      const imported = body.results.rows[0];
      expect(imported.outcome).toBe("created");

      await expect(readAssignees(imported.taskId)).resolves.toEqual([
        member.user.id,
      ]);
    });

    it("re-importing only the primary assignee keeps the co-assignees", async () => {
      const member = await createWorkspaceMember({ role: "admin" });
      const { project } = await createProjectFixture({
        workspaceId: member.workspace.id,
      });
      const second = await addWorkspaceMember(member.workspace.id, "Segunda");
      const third = await addWorkspaceMember(member.workspace.id, "Tercera");

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const importRow = async (headers: string[], row: string[]) => {
        const content = `﻿${[headers, row]
          .map((cells) => cells.join(","))
          .join("\r\n")}\r\n`;
        const form = new FormData();
        form.append(
          "file",
          new File([content], "import.csv", { type: "text/csv" }),
        );
        form.append("mapping", JSON.stringify(proposeMapping(headers)));

        const response = await app.request(`/api/task/import/${project.id}`, {
          method: "POST",
          body: form,
        });
        expect(response.status).toBe(200);

        return (await response.json()) as {
          results: { rows: { taskId: string }[] };
        };
      };

      const created = await importRow(
        ["Referencia", "Título", "Responsable", "Asignados"],
        [
          "A-1",
          "Varias manos",
          member.user.email,
          `${second.email}; ${third.email}`,
        ],
      );
      const taskId = created.results.rows[0].taskId;
      expect((await readAssignees(taskId)).sort()).toEqual(
        [member.user.id, second.id, third.id].sort(),
      );

      // Una hoja que solo trae «Responsable» cambia el responsable: sale el
      // anterior y entra el nuevo, y el resto no se toca (regla 3 de la ADR
      // 017). Antes la importacion reconciliaba el conjunto entero y dejaba
      // la tarea con el nuevo responsable como unico asignado.
      await importRow(["Referencia", "Responsable"], ["A-1", second.email]);

      await expect(readPrimaryAssignee(taskId)).resolves.toBe(second.id);
      expect((await readAssignees(taskId)).sort()).toEqual(
        [second.id, third.id].sort(),
      );
    });
  });
  // `task.assignees_changed` no lo escuchaba nadie: ni el WebSocket, ni la
  // actividad, ni las notificaciones. Anadir a alguien a una tarea no le
  // llegaba por ningun canal, y tres meses despues nadie podia responder
  // "quien me metio en esta tarea".
  describe("assigning through the multi-assignee route reaches people", () => {
    it("notifies the people who were added, and only them", async () => {
      const member = await createWorkspaceMember({ role: "admin" });
      const second = await addWorkspaceMember(member.workspace.id, "Segunda");
      const third = await addWorkspaceMember(member.workspace.id, "Tercera");
      const { project, columns } = await createProjectFixture({
        workspaceId: member.workspace.id,
      });
      const task = await createTask(project.id, columns.todo.id);

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const first = await app.request(`/api/task/assignees/${task.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userIds: [second.id] }),
      });
      expect(first.status).toBe(200);

      // Quitar a nadie y anadir a la tercera: la segunda no vuelve a recibir.
      const again = await app.request(`/api/task/assignees/${task.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userIds: [second.id, third.id] }),
      });
      expect(again.status).toBe(200);

      // Los suscriptores de eventos corren fuera del ciclo de la peticion:
      // `publishEvent` emite y no espera al manejador.
      await vi.waitFor(async () => {
        const notifications = await db
          .select({
            userId: schema.notificationTable.userId,
            type: schema.notificationTable.type,
          })
          .from(schema.notificationTable)
          .where(eq(schema.notificationTable.resourceId, task.id));

        const perUser = notifications.filter(
          (row) => row.type === "task_assignee_changed",
        );

        expect(perUser.filter((row) => row.userId === second.id)).toHaveLength(
          1,
        );
        expect(perUser.filter((row) => row.userId === third.id)).toHaveLength(
          1,
        );
        // Quien hace el cambio no se avisa a si mismo.
        expect(
          perUser.filter((row) => row.userId === member.user.id),
        ).toHaveLength(0);
      });
    });

    it("leaves a trace in the activity history", async () => {
      const member = await createWorkspaceMember({ role: "admin" });
      const second = await addWorkspaceMember(member.workspace.id, "Segunda");
      const { project, columns } = await createProjectFixture({
        workspaceId: member.workspace.id,
      });
      const task = await createTask(project.id, columns.todo.id);

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const response = await app.request(`/api/task/assignees/${task.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userIds: [second.id] }),
      });
      expect(response.status).toBe(200);

      await vi.waitFor(async () => {
        const activities = await db
          .select({ type: schema.activityTable.type })
          .from(schema.activityTable)
          .where(eq(schema.activityTable.taskId, task.id));

        expect(activities.map((row) => row.type)).toContain(
          "assignees_changed",
        );
      });
    });
  });
});

describe("API integration: assignees in the task list", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  // Tablero y lista pintan la pila de asignados con lo que trae el listado,
  // sin pedir cada tarea por separado.
  it("lists every assignee of a shared task, the single one of a plain task, and none of an unassigned one", async () => {
    const admin = await createWorkspaceMember({ role: "admin" });
    const { project, columns } = await createProjectFixture({
      workspaceId: admin.workspace.id,
    });
    const ana = await addWorkspaceMember(admin.workspace.id, "Ana");
    const luis = await addWorkspaceMember(admin.workspace.id, "Luis");
    const shared = await createTask(project.id, columns.todo.id);
    const single = await db
      .insert(schema.taskTable)
      .values({
        ...taskTreeValues(),
        projectId: project.id,
        title: "Una sola persona",
        status: "to-do",
        columnId: columns.todo.id,
        priority: "medium",
        number: 2,
        position: 1,
      })
      .returning()
      .then((rows) => rows[0]);
    const none = await db
      .insert(schema.taskTable)
      .values({
        ...taskTreeValues(),
        projectId: project.id,
        title: "Sin nadie",
        status: "to-do",
        columnId: columns.todo.id,
        priority: "medium",
        number: 3,
        position: 2,
      })
      .returning()
      .then((rows) => rows[0]);
    if (!single || !none) throw new Error("Failed to seed tasks");

    mockAuthenticatedSession(admin.user);
    const { app } = createApp();
    const assign = (taskId: string, userIds: string[]) =>
      app.request(`/api/task/assignees/${taskId}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userIds }),
      });
    expect((await assign(shared.id, [ana.id, luis.id])).status).toBe(200);
    expect((await assign(single.id, [luis.id])).status).toBe(200);

    const response = await app.request(`/api/task/tasks/${project.id}`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: {
        columns: {
          tasks: {
            id: string;
            assignees: { id: string; name: string; image: string | null }[];
          }[];
        }[];
      };
    };
    const byId = new Map(
      body.data.columns.flatMap((column) =>
        column.tasks.map((task) => [task.id, task.assignees] as const),
      ),
    );

    expect(byId.get(shared.id)).toEqual([
      { id: ana.id, name: "Ana", image: null },
      { id: luis.id, name: "Luis", image: null },
    ]);
    expect(byId.get(single.id)).toEqual([
      { id: luis.id, name: "Luis", image: null },
    ]);
    expect(byId.get(none.id)).toEqual([]);
  });
});
