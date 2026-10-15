import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { settleEvents } from "../../apps/api/src/events";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  addWorkspaceMember,
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

type Page = {
  id: string;
  version: number;
  parentId: string | null;
  updatedAt: string;
};

async function setup() {
  const ana = await createWorkspaceMember({ userName: "Ana", role: "admin" });
  const marc = await addWorkspaceMember(ana.workspace.id, "member");
  const vera = await addWorkspaceMember(ana.workspace.id, "viewer");
  const { project } = await createProjectFixture({
    workspaceId: ana.workspace.id,
  });
  const app = createApp().app;
  const as = (user: { id: string }) => {
    mockAuthenticatedSession(user as never);
    return (method: string, path: string, body?: unknown) =>
      app.request(path, {
        method,
        headers: { "content-type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
  };
  const ok = async <T = Record<string, unknown>>(
    pending: Promise<Response>,
  ) => {
    const response = await pending;
    if (response.status !== 200) {
      throw new Error(`${response.status} ${await response.text()}`);
    }
    return response.json() as Promise<T>;
  };
  const workspaceId = ana.workspace.id;
  return { ana, marc, vera, project, workspaceId, as, ok };
}

describe("API integration: wiki (ADR 092)", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("keeps a workspace tree and a project tree, and lets only task editors write", async () => {
    const { ana, vera, project, workspaceId, as, ok } = await setup();
    const send = as(ana.user);
    const manual = await ok<Page>(
      send("POST", `/api/wiki/workspace/${workspaceId}/pages`, {
        title: "Manual de calidad",
      }),
    );
    const procedures = await ok<Page>(
      send("POST", `/api/wiki/workspace/${workspaceId}/pages`, {
        title: "Procedimientos",
        projectId: project.id,
      }),
    );
    await ok(
      send("POST", `/api/wiki/workspace/${workspaceId}/pages`, {
        title: "Puesta en marcha del cuadro",
        projectId: project.id,
        parentId: procedures.id,
      }),
    );

    const workspaceOnly = await ok<Array<{ title: string }>>(
      send("GET", `/api/wiki/workspace/${workspaceId}/pages`),
    );
    expect(workspaceOnly.map((page) => page.title)).toEqual([
      "Manual de calidad",
    ]);
    const withProject = await ok<Array<{ title: string }>>(
      send(
        "GET",
        `/api/wiki/workspace/${workspaceId}/pages?projectId=${project.id}`,
      ),
    );
    expect(withProject).toHaveLength(3);

    // Una pagina del proyecto no cuelga de una del espacio.
    const crossed = await send(
      "POST",
      `/api/wiki/workspace/${workspaceId}/pages`,
      { title: "Mezcla", projectId: project.id, parentId: manual.id },
    );
    expect(crossed.status).toBe(400);

    // Quien solo lee, lee.
    const reader = as(vera);
    await ok(reader("GET", `/api/wiki/page/${manual.id}`));
    const denied = await reader(
      "POST",
      `/api/wiki/workspace/${workspaceId}/pages`,
      { title: "No" },
    );
    expect(denied.status).toBe(403);

    // Alguien de otro espacio, ni eso.
    const outsider = await createWorkspaceMember({ userName: "Luis" });
    const foreign = await as(outsider.user)(
      "GET",
      `/api/wiki/page/${manual.id}`,
    );
    expect([403, 404]).toContain(foreign.status);
  });

  it("saves with an optimistic lock, keeps every version and restores one", async () => {
    const { ana, marc, workspaceId, as, ok } = await setup();
    const page = await ok<Page>(
      as(ana.user)("POST", `/api/wiki/workspace/${workspaceId}/pages`, {
        title: "Corte de suministro",
        content: "1. Avisar a la distribuidora.",
      }),
    );

    const saved = await ok<Page>(
      as(marc)("PUT", `/api/wiki/page/${page.id}`, {
        title: "Corte de suministro",
        content: "1. Avisar a la distribuidora con 48 h.",
        baseVersion: 1,
        note: "Plazo del aviso",
      }),
    );
    expect(saved.version).toBe(2);

    // Ana editaba la version 1: guardar encima de la de Marc es un 409.
    const stale = await as(ana.user)("PUT", `/api/wiki/page/${page.id}`, {
      title: "Corte de suministro",
      content: "1. Avisar.",
      baseVersion: 1,
    });
    expect(stale.status).toBe(409);
    expect(await stale.text()).toContain("version 2");

    // Guardar encima, a sabiendas: con la version de Marc.
    const over = await ok<Page>(
      as(ana.user)("PUT", `/api/wiki/page/${page.id}`, {
        title: "Corte de suministro",
        content: "1. Avisar.",
        baseVersion: 2,
      }),
    );
    expect(over.version).toBe(3);

    // Sin cambios no hay version nueva.
    const same = await ok<Page>(
      as(ana.user)("PUT", `/api/wiki/page/${page.id}`, {
        title: "Corte de suministro",
        content: "1. Avisar.",
        baseVersion: 3,
      }),
    );
    expect(same.version).toBe(3);

    const versions = await ok<
      Array<{ version: number; note: string | null; authorName: string }>
    >(as(ana.user)("GET", `/api/wiki/page/${page.id}/versions`));
    expect(versions.map((row) => row.version)).toEqual([3, 2, 1]);
    expect(versions[1]?.note).toBe("Plazo del aviso");

    const restored = await ok<Page & { content: string }>(
      as(ana.user)("POST", `/api/wiki/page/${page.id}/restore`, {
        version: 2,
        baseVersion: 3,
      }),
    );
    expect(restored.version).toBe(4);
    expect(restored.content).toBe("1. Avisar a la distribuidora con 48 h.");
    const four = await ok<{ restoredFrom: number }>(
      as(ana.user)("GET", `/api/wiki/page/${page.id}/versions/4`),
    );
    expect(four.restoredFrom).toBe(2);
  });

  it("moves without cycles and deletes lifting or taking the subpages", async () => {
    const { ana, workspaceId, as, ok } = await setup();
    const send = as(ana.user);
    const create = (title: string, parentId?: string) =>
      ok<Page>(
        send("POST", `/api/wiki/workspace/${workspaceId}/pages`, {
          title,
          parentId,
        }),
      );
    const root = await create("Obras");
    const child = await create("Alcalá", root.id);
    const grandchild = await create("Actas", child.id);

    const cycle = await send("PATCH", `/api/wiki/page/${root.id}/move`, {
      parentId: grandchild.id,
    });
    expect(cycle.status).toBe(400);

    // Moverla no es editarla: «editada hace…» sigue en su ultima version.
    const loose = await create("Contactos");
    const moved = await ok<Page>(
      send("PATCH", `/api/wiki/page/${loose.id}/move`, { parentId: root.id }),
    );
    expect(moved.parentId).toBe(root.id);
    expect(moved.updatedAt).toBe(loose.updatedAt);

    // Borrar solo la intermedia: su hija sube al abuelo.
    const lifted = await ok<{ deleted: number }>(
      send("DELETE", `/api/wiki/page/${child.id}?children=lift`),
    );
    expect(lifted.deleted).toBe(1);
    const afterLift = await ok<Page>(
      send("GET", `/api/wiki/page/${grandchild.id}`),
    );
    expect(afterLift.parentId).toBe(root.id);
    expect(afterLift.updatedAt).toBe(grandchild.updatedAt);

    // Borrar la rama entera.
    const branch = await ok<{ deleted: number }>(
      send("DELETE", `/api/wiki/page/${root.id}?children=delete`),
    );
    expect(branch.deleted).toBe(3);
    // Un recurso que no existe da 400 en el middleware de acceso, como una
    // tarea: no se sabe de que espacio es.
    expect((await send("GET", `/api/wiki/page/${grandchild.id}`)).status).toBe(
      400,
    );
  });

  it("links pages and tasks both ways and finds pages in search", async () => {
    const { ana, project, workspaceId, as, ok } = await setup();
    const send = as(ana.user);
    const task = await ok<{ id: string }>(
      send("POST", `/api/task/${project.id}`, {
        title: "Tendido de cableado",
        description: "",
        priority: "medium",
        status: "to-do",
      }),
    );
    const page = await ok<Page>(
      send("POST", `/api/wiki/workspace/${workspaceId}/pages`, {
        title: "Puesta en marcha",
        projectId: project.id,
        content: `Antes, el boletín (<riuna-issue-link url="http://localhost/dashboard/workspace/${workspaceId}/project/${project.id}/task/${task.id}" issue-key="" task-id="${task.id}" />) y la medición de aislamiento.`,
      }),
    );

    const fromPage = await ok<{
      links: Array<{ taskId: string; sources: string[] }>;
    }>(send("GET", `/api/wiki/page/${page.id}`));
    expect(fromPage.links).toEqual([
      expect.objectContaining({ taskId: task.id, sources: ["page"] }),
    ]);

    // La descripcion de la tarea enlaza la pagina: los dos sentidos.
    await ok(
      send("PUT", `/api/task/description/${task.id}`, {
        description: `Ver <riuna-page-link page-id="${page.id}" title="Puesta en marcha"></riuna-page-link>.`,
      }),
    );
    const fromTask = await ok<Array<{ pageId: string; sources: string[] }>>(
      send("GET", `/api/wiki/task/${task.id}/links`),
    );
    expect(fromTask).toEqual([
      expect.objectContaining({
        pageId: page.id,
        sources: expect.arrayContaining(["page", "task"]),
      }),
    ]);

    const found = await ok<{ results: Array<{ type: string; id: string }> }>(
      send(
        "GET",
        `/api/search?q=aislamiento&type=wiki&workspaceId=${workspaceId}`,
      ),
    );
    expect(found.results).toEqual([
      expect.objectContaining({ type: "wiki_page", id: page.id }),
    ]);
  });

  it("notifies a mention only the first time it appears in the page", async () => {
    const { ana, marc, workspaceId, as, ok } = await setup();
    const send = as(ana.user);
    const mention = `<riuna-mention id="${marc.id}" label="Marc"></riuna-mention>`;
    const page = await ok<Page>(
      send("POST", `/api/wiki/workspace/${workspaceId}/pages`, {
        title: "Contactos de obra",
        content: `Pregunta a ${mention}.`,
      }),
    );
    // Quitarla y volver a ponerla no avisa otra vez.
    await ok(
      send("PUT", `/api/wiki/page/${page.id}`, {
        title: "Contactos de obra",
        content: "Sin nadie.",
        baseVersion: 1,
      }),
    );
    await ok(
      send("PUT", `/api/wiki/page/${page.id}`, {
        title: "Contactos de obra",
        content: `Otra vez ${mention}.`,
        baseVersion: 2,
      }),
    );
    await settleEvents();

    const notifications = await db
      .select({ type: schema.notificationTable.type })
      .from(schema.notificationTable)
      .where(
        and(
          eq(schema.notificationTable.userId, marc.id),
          eq(schema.notificationTable.type, "wiki_mention"),
        ),
      );
    expect(notifications).toHaveLength(1);
  });
});
