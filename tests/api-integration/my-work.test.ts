import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAnonymousSession, mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
  taskTreeValues,
} from "./helpers/fixtures";

type MyWorkResponse = {
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    isDone: boolean;
    projectId: string;
    projectName: string;
    projectSlug: string;
    teamId: string | null;
    teamName: string | null;
    assignees: Array<{ id: string; name: string }>;
    labels: Array<{ id: string; name: string }>;
  }>;
  pagination: { page: number; pageSize: number; hasMore: boolean };
};

function myWorkUrl(params: Record<string, string>) {
  return `/api/my-work/tasks?${new URLSearchParams(params).toString()}`;
}

let taskCounter = 0;

async function createTask({
  projectId,
  title,
  status = "to-do",
  assigneeId,
  teamId,
}: {
  projectId: string;
  title: string;
  status?: string;
  assigneeId?: string;
  teamId?: string;
}) {
  taskCounter += 1;

  const [task] = await db
    .insert(schema.taskTable)
    .values({
      ...taskTreeValues(),
      projectId,
      title,
      status,
      priority: "medium",
      number: taskCounter,
      position: taskCounter,
      userId: assigneeId ?? null,
      teamId: teamId ?? null,
    })
    .returning();

  if (assigneeId) {
    await db
      .insert(schema.taskAssigneeTable)
      .values({ taskId: task.id, userId: assigneeId });
  }

  return task;
}

async function createTeam(workspaceId: string, name = "Desarrollo") {
  const [team] = await db
    .insert(schema.teamTable)
    .values({
      id: `team-${randomUUID()}`,
      workspaceId,
      name,
      createdAt: new Date(),
    })
    .returning();

  return team;
}

describe("API integration: my work", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    taskCounter = 0;
  });

  // La razon de ser de la pagina: hoy no hay ni una sola consulta de tareas que
  // cruce proyectos.
  it("gathers the user's tasks from every project of the workspace", async () => {
    const member = await createWorkspaceMember({ role: "member" });
    const stranger = await createWorkspaceMember({ role: "member" });

    const first = await createProjectFixture({
      workspaceId: member.workspace.id,
      name: "Riuna",
    });
    const second = await createProjectFixture({
      workspaceId: member.workspace.id,
      name: "SERVITEC",
    });
    const foreign = await createProjectFixture({
      workspaceId: stranger.workspace.id,
      name: "Ajeno",
    });

    await createTask({
      projectId: first.project.id,
      title: "Tarea del primero",
      assigneeId: member.user.id,
    });
    await createTask({
      projectId: second.project.id,
      title: "Tarea del segundo",
      assigneeId: member.user.id,
    });
    // Misma persona, otro espacio de trabajo: no debe cruzar la frontera.
    await createTask({
      projectId: foreign.project.id,
      title: "Tarea ajena",
      assigneeId: member.user.id,
    });
    await createTask({
      projectId: first.project.id,
      title: "Tarea de otro",
      assigneeId: stranger.user.id,
    });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request(
      myWorkUrl({ workspaceId: member.workspace.id, scope: "assigned" }),
    );

    expect(response.status).toBe(200);

    const payload = (await response.json()) as MyWorkResponse;
    const titles = payload.tasks.map((task) => task.title).sort();

    expect(titles).toEqual(["Tarea del primero", "Tarea del segundo"]);

    const projectNames = payload.tasks.map((task) => task.projectName).sort();
    expect(projectNames).toEqual(["Riuna", "SERVITEC"]);

    for (const task of payload.tasks) {
      expect(task.projectSlug).toBeTruthy();
      expect(task.assignees.map((a) => a.id)).toContain(member.user.id);
    }
  });

  // `team_member` no tiene `unique(team_id, user_id)`. Unir la consulta
  // principal contra ella devolveria la tarea una vez por fila duplicada, y sin
  // esta prueba el arreglo —resolver los ids aparte— seria invisible.
  it("does not duplicate a task when the membership row is duplicated", async () => {
    const member = await createWorkspaceMember({ role: "member" });
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const team = await createTeam(member.workspace.id);

    await db.insert(schema.teamMemberTable).values([
      { id: `tm-${randomUUID()}`, teamId: team.id, userId: member.user.id },
      { id: `tm-${randomUUID()}`, teamId: team.id, userId: member.user.id },
    ]);

    await createTask({
      projectId: project.id,
      title: "Del departamento",
      teamId: team.id,
    });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request(
      myWorkUrl({ workspaceId: member.workspace.id, scope: "team" }),
    );

    expect(response.status).toBe(200);

    const payload = (await response.json()) as MyWorkResponse;

    expect(payload.tasks).toHaveLength(1);
    expect(payload.tasks[0].title).toBe("Del departamento");
    expect(payload.tasks[0].teamName).toBe("Desarrollo");
  });

  // Quien no pertenece a ningun equipo no puede recibir un 500: `inArray` con
  // un array vacio compila a `in ()`, que es un error de sintaxis de Postgres.
  it("answers an empty page for a user with no teams", async () => {
    const member = await createWorkspaceMember({ role: "member" });
    await createProjectFixture({ workspaceId: member.workspace.id });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request(
      myWorkUrl({ workspaceId: member.workspace.id, scope: "team" }),
    );

    expect(response.status).toBe(200);

    const payload = (await response.json()) as MyWorkResponse;
    expect(payload.tasks).toEqual([]);
    expect(payload.pagination.hasMore).toBe(false);
  });

  // "Hecho" se resuelve proyecto a proyecto, y aqui la regla esta escrita dos
  // veces: el predicado SQL que excluye y la bandera `isDone` que decora. Esta
  // prueba es lo unico que impide que se separen.
  it("resolves done per project and keeps the SQL predicate and isDone in step", async () => {
    const member = await createWorkspaceMember({ role: "member" });

    const standard = await createProjectFixture({
      workspaceId: member.workspace.id,
      name: "Estandar",
    });
    const renamed = await createProjectFixture({
      workspaceId: member.workspace.id,
      name: "Renombrado",
    });
    const legacy = await createProjectFixture({
      workspaceId: member.workspace.id,
      name: "Heredado",
    });

    // Proyecto 2: la columna final es `finalizado` y `done` deja de serlo.
    await db
      .update(schema.columnTable)
      .set({ slug: "finalizado", name: "Finalizado" })
      .where(eq(schema.columnTable.id, renamed.columns.done.id));
    await db.insert(schema.columnTable).values({
      projectId: renamed.project.id,
      name: "Done",
      slug: "done",
      position: 9,
      isFinal: false,
    });

    // Proyecto 3: ninguna columna marcada como final, como una instalacion
    // heredada de Kaneo. El respaldo dice que `done` sigue contando.
    await db
      .update(schema.columnTable)
      .set({ isFinal: false })
      .where(eq(schema.columnTable.projectId, legacy.project.id));

    await createTask({
      projectId: standard.project.id,
      title: "Estandar hecha",
      status: "done",
      assigneeId: member.user.id,
    });
    await createTask({
      projectId: renamed.project.id,
      title: "Renombrada hecha",
      status: "finalizado",
      assigneeId: member.user.id,
    });
    await createTask({
      projectId: renamed.project.id,
      title: "Renombrada pendiente",
      status: "done",
      assigneeId: member.user.id,
    });
    await createTask({
      projectId: legacy.project.id,
      title: "Heredada hecha",
      status: "done",
      assigneeId: member.user.id,
    });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const pending = (await (
      await app.request(
        myWorkUrl({ workspaceId: member.workspace.id, scope: "assigned" }),
      )
    ).json()) as MyWorkResponse;

    // El unico `done` que no es final es el del proyecto renombrado.
    expect(pending.tasks.map((task) => task.title)).toEqual([
      "Renombrada pendiente",
    ]);
    expect(pending.tasks[0].isDone).toBe(false);

    const all = (await (
      await app.request(
        myWorkUrl({
          workspaceId: member.workspace.id,
          scope: "assigned",
          includeDone: "true",
        }),
      )
    ).json()) as MyWorkResponse;

    const doneByTitle = new Map(
      all.tasks.map((task) => [task.title, task.isDone]),
    );

    expect(doneByTitle.get("Estandar hecha")).toBe(true);
    expect(doneByTitle.get("Renombrada hecha")).toBe(true);
    expect(doneByTitle.get("Renombrada pendiente")).toBe(false);
    expect(doneByTitle.get("Heredada hecha")).toBe(true);

    // Lo que el predicado excluye es exactamente lo que la bandera marca.
    const excluded = all.tasks
      .filter((task) => !pending.tasks.some((row) => row.id === task.id))
      .map((task) => task.isDone);

    expect(excluded).toEqual([true, true, true]);
  });

  it("paginates with a total order and reports hasMore", async () => {
    const member = await createWorkspaceMember({ role: "member" });
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });

    for (const title of ["Uno", "Dos", "Tres"]) {
      await createTask({
        projectId: project.id,
        title,
        assigneeId: member.user.id,
      });
    }

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const first = (await (
      await app.request(
        myWorkUrl({
          workspaceId: member.workspace.id,
          scope: "assigned",
          limit: "2",
        }),
      )
    ).json()) as MyWorkResponse;

    expect(first.tasks).toHaveLength(2);
    expect(first.pagination.hasMore).toBe(true);

    const second = (await (
      await app.request(
        myWorkUrl({
          workspaceId: member.workspace.id,
          scope: "assigned",
          limit: "2",
          page: "2",
        }),
      )
    ).json()) as MyWorkResponse;

    expect(second.tasks).toHaveLength(1);
    expect(second.pagination.hasMore).toBe(false);

    // Sin un orden total, dos paginas consecutivas pueden solaparse.
    const ids = [...first.tasks, ...second.tasks].map((task) => task.id);
    expect(new Set(ids).size).toBe(3);
  });

  it("refuses anyone who is not a member of the workspace", async () => {
    const member = await createWorkspaceMember({ role: "member" });
    const stranger = await createWorkspaceMember({ role: "member" });
    await createProjectFixture({ workspaceId: member.workspace.id });

    mockAuthenticatedSession(stranger.user);
    const { app } = createApp();

    const response = await app.request(
      myWorkUrl({ workspaceId: member.workspace.id, scope: "assigned" }),
    );

    expect(response.status).toBe(403);
  });

  it("rejects an unauthenticated request and a missing workspace", async () => {
    const member = await createWorkspaceMember({ role: "member" });

    mockAnonymousSession();
    const anonymousApp = createApp();

    expect(
      (
        await anonymousApp.app.request(
          myWorkUrl({ workspaceId: member.workspace.id, scope: "assigned" }),
        )
      ).status,
    ).toBe(401);

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    expect(
      (await app.request("/api/my-work/tasks?scope=assigned")).status,
    ).toBe(400);
  });

  // Prueba que la pagina lee `task_assignee` y que `syncPrimaryAssignee` la
  // mantiene cierta: asignar por la ruta del responsable principal basta para
  // que la tarea aparezca.
  it("sees a task assigned through the primary-assignee route", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const task = await createTask({
      projectId: project.id,
      title: "Sin asignar todavia",
    });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const assigned = await app.request(`/api/task/assignee/${task.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: member.user.id }),
    });

    expect(assigned.status).toBe(200);

    const payload = (await (
      await app.request(
        myWorkUrl({ workspaceId: member.workspace.id, scope: "assigned" }),
      )
    ).json()) as MyWorkResponse;

    expect(payload.tasks.map((row) => row.id)).toEqual([task.id]);
  });

  it("leaves out archived tasks and tasks of archived projects", async () => {
    const member = await createWorkspaceMember({ role: "member" });
    const live = await createProjectFixture({
      workspaceId: member.workspace.id,
      name: "Vivo",
    });
    const archived = await createProjectFixture({
      workspaceId: member.workspace.id,
      name: "Archivado",
    });

    await db
      .update(schema.projectTable)
      .set({ archivedAt: new Date() })
      .where(eq(schema.projectTable.id, archived.project.id));

    await createTask({
      projectId: live.project.id,
      title: "Visible",
      assigneeId: member.user.id,
    });
    await createTask({
      projectId: live.project.id,
      title: "Archivada",
      status: "archived",
      assigneeId: member.user.id,
    });
    await createTask({
      projectId: archived.project.id,
      title: "De proyecto archivado",
      assigneeId: member.user.id,
    });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const payload = (await (
      await app.request(
        myWorkUrl({
          workspaceId: member.workspace.id,
          scope: "assigned",
          includeDone: "true",
        }),
      )
    ).json()) as MyWorkResponse;

    expect(payload.tasks.map((task) => task.title)).toEqual(["Visible"]);
  });
});
