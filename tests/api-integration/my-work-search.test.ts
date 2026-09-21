import { createHash, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
  taskTreeValues,
} from "./helpers/fixtures";

type SearchResponse = {
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
    estimate: number | null;
    isDone: boolean;
    projectId: string;
    projectName: string;
  }>;
  pagination: {
    page: number;
    pageSize: number;
    hasMore: boolean;
    total: number;
    totalIsCapped: boolean;
  };
};

function searchUrl(params: Record<string, string>) {
  return `/api/my-work/tasks/search?${new URLSearchParams(params).toString()}`;
}

let taskCounter = 0;

async function createTask({
  projectId,
  title,
  status = "to-do",
  priority = "medium",
  assigneeId,
  teamId,
  estimate,
}: {
  projectId: string;
  title: string;
  status?: string;
  priority?: string;
  assigneeId?: string;
  teamId?: string;
  estimate?: number;
}) {
  taskCounter += 1;

  const [task] = await db
    .insert(schema.taskTable)
    .values({
      ...taskTreeValues(),
      projectId,
      title,
      status,
      priority,
      number: taskCounter,
      position: taskCounter,
      userId: assigneeId ?? null,
      teamId: teamId ?? null,
      estimate: estimate ?? null,
    })
    .returning();

  if (assigneeId) {
    await db
      .insert(schema.taskAssigneeTable)
      .values({ taskId: task.id, userId: assigneeId });
  }

  return task;
}

describe("API integration: workspace task search", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    taskCounter = 0;
  });

  it("gathers the user's tasks from every project and stops at the workspace border", async () => {
    const member = await createWorkspaceMember({ role: "member" });
    const stranger = await createWorkspaceMember({ role: "member" });

    const first = await createProjectFixture({
      workspaceId: member.workspace.id,
      name: "Obra Norte",
    });
    const second = await createProjectFixture({
      workspaceId: member.workspace.id,
      name: "SAT",
    });
    const foreign = await createProjectFixture({
      workspaceId: stranger.workspace.id,
      name: "Ajeno",
    });

    await createTask({
      projectId: first.project.id,
      title: "Del primero",
      assigneeId: member.user.id,
      estimate: 3600,
    });
    await createTask({
      projectId: second.project.id,
      title: "Del segundo",
      assigneeId: member.user.id,
    });
    // La misma persona en otro espacio: la frontera no se cruza.
    await createTask({
      projectId: foreign.project.id,
      title: "De otro espacio",
      assigneeId: member.user.id,
    });
    await createTask({
      projectId: first.project.id,
      title: "De otra persona",
      assigneeId: stranger.user.id,
    });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request(
      searchUrl({ workspaceId: member.workspace.id, scope: "assigned" }),
    );

    expect(response.status).toBe(200);

    const payload = (await response.json()) as SearchResponse;

    expect(payload.tasks.map((task) => task.title).sort()).toEqual([
      "Del primero",
      "Del segundo",
    ]);
    expect(payload.pagination.total).toBe(2);

    // `estimate` es lo que `getMyWork` no devuelve y las vistas personales
    // necesitan para sumar carga.
    const withEstimate = payload.tasks.find((t) => t.title === "Del primero");
    expect(withEstimate?.estimate).toBe(3600);
  });

  it("narrows the list with the view filter engine", async () => {
    const member = await createWorkspaceMember({ role: "member" });
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });

    await createTask({
      projectId: project.id,
      title: "Urgente",
      priority: "urgent",
      assigneeId: member.user.id,
    });
    await createTask({
      projectId: project.id,
      title: "Tranquila",
      priority: "low",
      assigneeId: member.user.id,
    });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request(
      searchUrl({
        workspaceId: member.workspace.id,
        scope: "assigned",
        filter: JSON.stringify({
          type: "condition",
          field: "priority",
          operator: "eq",
          value: "urgent",
        }),
      }),
    );

    expect(response.status).toBe(200);

    const payload = (await response.json()) as SearchResponse;
    expect(payload.tasks.map((task) => task.title)).toEqual(["Urgente"]);
    expect(payload.pagination.total).toBe(1);
  });

  /**
   * ADR 038: lo que una vista transversal no puede ofrecer. `status` compara
   * contra slugs de columna, que son por proyecto, asi que filtrar por el entre
   * proyectos no significa lo mismo en dos sitios. El registro del espacio lo
   * retira, y pedirlo es un 400 y no una lista vacia sin explicacion.
   */
  it("refuses a project-scoped field instead of answering something meaningless", async () => {
    const member = await createWorkspaceMember({ role: "member" });
    await createProjectFixture({ workspaceId: member.workspace.id });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    for (const field of ["status", "column", "number", "position", "depth"]) {
      const response = await app.request(
        searchUrl({
          workspaceId: member.workspace.id,
          scope: "assigned",
          filter: JSON.stringify({
            type: "condition",
            field,
            operator: "eq",
            value: "x",
          }),
        }),
      );

      expect(response.status, `field ${field}`).toBe(400);
      expect(await response.text()).toContain(field);
    }
  });

  /**
   * El caso peligroso del registro de espacio: un campo del espacio que algun
   * proyecto redefine **con otro tipo**. Si se ofreciera, las tareas de ese
   * proyecto desaparecerian del recuento en silencio. "El campo no se ofrece"
   * es el modo de fallo correcto para una superficie que informa.
   */
  it("does not offer a workspace field that a project redefines with another type", async () => {
    const member = await createWorkspaceMember({ role: "member" });
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });

    await db.insert(schema.fieldDefinitionTable).values([
      {
        workspaceId: member.workspace.id,
        projectId: null,
        key: "presupuesto",
        name: "Presupuesto",
        type: "number",
      },
      {
        workspaceId: member.workspace.id,
        projectId: project.id,
        key: "presupuesto",
        name: "Presupuesto",
        type: "text",
      },
      // Uno sano, para que la prueba distinga "se retira el eclipsado" de
      // "no se ofrece ninguno".
      {
        workspaceId: member.workspace.id,
        projectId: null,
        key: "cliente",
        name: "Cliente",
        type: "text",
      },
    ]);

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const shadowed = await app.request(
      searchUrl({
        workspaceId: member.workspace.id,
        scope: "assigned",
        filter: JSON.stringify({
          type: "condition",
          field: "custom.presupuesto",
          operator: "eq",
          value: 10,
        }),
      }),
    );

    expect(shadowed.status).toBe(400);

    const healthy = await app.request(
      searchUrl({
        workspaceId: member.workspace.id,
        scope: "assigned",
        filter: JSON.stringify({
          type: "condition",
          field: "custom.cliente",
          operator: "eq",
          value: "ACME",
        }),
      }),
    );

    expect(healthy.status).toBe(200);
  });

  it("paginates with a total order, so two pages never overlap", async () => {
    const member = await createWorkspaceMember({ role: "member" });
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });

    // Misma prioridad y sin fecha: todo empatado, que es donde un orden
    // incompleto repite o se salta filas entre paginas.
    for (let index = 0; index < 10; index += 1) {
      await createTask({
        projectId: project.id,
        title: `Tarea ${index}`,
        assigneeId: member.user.id,
      });
    }

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const pages = await Promise.all(
      ["1", "2"].map(async (page) => {
        const response = await app.request(
          searchUrl({
            workspaceId: member.workspace.id,
            scope: "assigned",
            page,
            limit: "4",
          }),
        );
        return (await response.json()) as SearchResponse;
      }),
    );

    const [first, second] = pages;

    expect(first.tasks).toHaveLength(4);
    expect(first.pagination.hasMore).toBe(true);
    expect(first.pagination.total).toBe(10);

    const ids = new Set([
      ...first.tasks.map((task) => task.id),
      ...second.tasks.map((task) => task.id),
    ]);
    expect(ids.size).toBe(8);
  });

  it("sorts by the requested field", async () => {
    const member = await createWorkspaceMember({ role: "member" });
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });

    for (const title of ["Carlos", "Ana", "Berta"]) {
      await createTask({
        projectId: project.id,
        title,
        assigneeId: member.user.id,
      });
    }

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request(
      searchUrl({
        workspaceId: member.workspace.id,
        scope: "assigned",
        sortBy: "title",
        sortOrder: "asc",
      }),
    );

    const payload = (await response.json()) as SearchResponse;
    expect(payload.tasks.map((task) => task.title)).toEqual([
      "Ana",
      "Berta",
      "Carlos",
    ]);
  });

  /**
   * `inArray(col, [])` compila a `in ()`, que es un error de sintaxis de
   * Postgres. Sin la salida temprana esto era un 500 para todo el que no
   * pertenece a ningun equipo, que es casi todo el mundo el primer dia; y
   * tratarlo como "sin filtro" seria peor todavia: entregaria el espacio entero.
   */
  it("answers an empty page, not the whole workspace, to someone with no teams", async () => {
    const member = await createWorkspaceMember({ role: "member" });
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });

    await createTask({ projectId: project.id, title: "De nadie" });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request(
      searchUrl({ workspaceId: member.workspace.id, scope: "team" }),
    );

    expect(response.status).toBe(200);

    const payload = (await response.json()) as SearchResponse;
    expect(payload.tasks).toEqual([]);
    expect(payload.pagination.total).toBe(0);
  });

  it("leaves out finished tasks unless they are asked for", async () => {
    const member = await createWorkspaceMember({ role: "member" });
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });

    await createTask({
      projectId: project.id,
      title: "Pendiente",
      assigneeId: member.user.id,
    });
    await createTask({
      projectId: project.id,
      title: "Terminada",
      status: "done",
      assigneeId: member.user.id,
    });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const withoutDone = (await (
      await app.request(
        searchUrl({ workspaceId: member.workspace.id, scope: "assigned" }),
      )
    ).json()) as SearchResponse;

    expect(withoutDone.tasks.map((task) => task.title)).toEqual(["Pendiente"]);

    const withDone = (await (
      await app.request(
        searchUrl({
          workspaceId: member.workspace.id,
          scope: "assigned",
          includeDone: "true",
        }),
      )
    ).json()) as SearchResponse;

    expect(withDone.tasks.map((task) => task.title).sort()).toEqual([
      "Pendiente",
      "Terminada",
    ]);
    expect(withDone.tasks.find((t) => t.title === "Terminada")?.isDone).toBe(
      true,
    );
  });

  it("ignores archived projects and archived tasks", async () => {
    const member = await createWorkspaceMember({ role: "member" });
    const live = await createProjectFixture({
      workspaceId: member.workspace.id,
      name: "Viva",
    });
    const archived = await createProjectFixture({
      workspaceId: member.workspace.id,
      name: "Archivada",
    });

    await db
      .update(schema.projectTable)
      .set({ archivedAt: new Date() })
      .where(eq(schema.projectTable.id, archived.project.id));

    await createTask({
      projectId: live.project.id,
      title: "Viva",
      assigneeId: member.user.id,
    });
    await createTask({
      projectId: live.project.id,
      title: "Tarea archivada",
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
        searchUrl({ workspaceId: member.workspace.id, scope: "assigned" }),
      )
    ).json()) as SearchResponse;

    expect(payload.tasks.map((task) => task.title)).toEqual(["Viva"]);
  });

  /**
   * La razon de ser del `requireApiKeyScope` de este modulo: una clave emitida
   * para un script de informes no puede enumerar los titulos de todos los
   * proyectos del espacio.
   */
  it("rejects an API key whose scope does not cover reading tasks", async () => {
    const member = await createWorkspaceMember({ role: "member" });
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    await createTask({
      projectId: project.id,
      title: "Secreta",
      assigneeId: member.user.id,
    });

    const plainKey = `riuna_${randomUUID()}`;
    const hashed = createHash("sha256")
      .update(plainKey)
      .digest("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");

    await db.insert(schema.apikeyTable).values({
      id: `apikey-${randomUUID()}`,
      name: "Informes",
      key: hashed,
      userId: member.user.id,
      referenceId: member.user.id,
      enabled: true,
      permissions: JSON.stringify({ project: ["read"] }),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const { app } = createApp();

    const response = await app.request(
      searchUrl({ workspaceId: member.workspace.id, scope: "assigned" }),
      { headers: { "x-api-key": plainKey } },
    );

    expect(response.status).toBe(403);
  });

  it("rejects a filter that is not valid JSON", async () => {
    const member = await createWorkspaceMember({ role: "member" });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request(
      searchUrl({
        workspaceId: member.workspace.id,
        scope: "assigned",
        filter: "{no soy json",
      }),
    );

    expect(response.status).toBe(400);
  });
});
