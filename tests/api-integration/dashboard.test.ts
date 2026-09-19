import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { MAX_WIDGETS_PER_DASHBOARD } from "../../apps/api/src/dashboard/widget-config";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAnonymousSession, mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

type Dashboard = {
  id: string;
  name: string;
  widgets: Array<{ id: string; title: string; position: number }>;
};

function json(body: unknown) {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  } as const;
}

describe("API integration: personal dashboards", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  async function seedDashboard(workspaceId: string, userId: string) {
    const [dashboard] = await db
      .insert(schema.dashboardTable)
      .values({ workspaceId, createdBy: userId, name: "Panel" })
      .returning();

    return dashboard;
  }

  it("creates a dashboard and lists it with its widgets", async () => {
    const member = await createWorkspaceMember({ role: "member" });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const created = await app.request(
      "/api/dashboard",
      json({ workspaceId: member.workspace.id, name: "Mi panel" }),
    );
    expect(created.status).toBe(200);
    const dashboard = (await created.json()) as Dashboard;

    const widget = await app.request(
      `/api/dashboard/${dashboard.id}/widget`,
      json({
        type: "count",
        title: "Pendientes",
        config: { metric: "count" },
      }),
    );
    expect(widget.status).toBe(200);

    const list = await app.request(
      `/api/dashboard?workspaceId=${member.workspace.id}`,
    );
    const payload = (await list.json()) as Dashboard[];

    expect(payload).toHaveLength(1);
    expect(payload[0].widgets).toHaveLength(1);
    expect(payload[0].widgets[0].title).toBe("Pendientes");
  });

  it("seeds the default layout the first time, and only once", async () => {
    const member = await createWorkspaceMember({ role: "member" });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const first = (await (
      await app.request(`/api/dashboard?workspaceId=${member.workspace.id}`)
    ).json()) as Dashboard[];

    // Un panel vacio no responde ninguna pregunta: quien entra por primera vez
    // ve su trabajo, no un boton de "anadir widget".
    expect(first).toHaveLength(1);
    expect(first[0].widgets.length).toBeGreaterThan(0);

    const titles = first[0].widgets.map((widget) => widget.title);
    expect(titles).toContain("Asignadas a mí");

    const second = (await (
      await app.request(`/api/dashboard?workspaceId=${member.workspace.id}`)
    ).json()) as Dashboard[];

    // Y una sola vez: el indice unico parcial es lo que lo garantiza incluso
    // con dos cargas a la vez.
    expect(second).toHaveLength(1);
    expect(second[0].id).toBe(first[0].id);
    expect(second[0].widgets).toHaveLength(first[0].widgets.length);
  });

  it("gives each person their own panel, not a shared one", async () => {
    const owner = await createWorkspaceMember({ role: "member" });
    const [other] = await db
      .insert(schema.userTable)
      .values({
        id: `user-${Date.now()}`,
        email: "otra@example.com",
        emailVerified: true,
        name: "Otra persona",
      })
      .returning();

    await db.insert(schema.workspaceUserTable).values({
      workspaceId: owner.workspace.id,
      userId: other.id,
      role: "member",
      joinedAt: new Date(),
    });

    mockAuthenticatedSession(owner.user);
    const ownerApp = createApp().app;
    const ownerPanels = (await (
      await ownerApp.request(`/api/dashboard?workspaceId=${owner.workspace.id}`)
    ).json()) as Dashboard[];

    mockAuthenticatedSession(other);
    const otherApp = createApp().app;
    const otherPanels = (await (
      await otherApp.request(`/api/dashboard?workspaceId=${owner.workspace.id}`)
    ).json()) as Dashboard[];

    // Comparten espacio de trabajo: lo que los separa es la propiedad.
    expect(ownerPanels).toHaveLength(1);
    expect(otherPanels).toHaveLength(1);
    expect(otherPanels[0].id).not.toBe(ownerPanels[0].id);
  });

  it("refuses to change someone else's dashboard", async () => {
    const owner = await createWorkspaceMember({ role: "admin" });
    const dashboard = await seedDashboard(owner.workspace.id, owner.user.id);

    const intruder = await createWorkspaceMember({ role: "admin" });
    await db.insert(schema.workspaceUserTable).values({
      workspaceId: owner.workspace.id,
      userId: intruder.user.id,
      role: "admin",
      joinedAt: new Date(),
    });

    mockAuthenticatedSession(intruder.user);
    const { app } = createApp();

    const response = await app.request(`/api/dashboard/${dashboard.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Mio ahora" }),
    });

    // Ni siquiera un administrador del espacio: un panel **personal** no es
    // suyo. Desde la rebanada 2 el administrador si puede retirar uno
    // compartido, pero eso es otra cosa y lo fija `dashboard-sharing.test.ts`.
    expect(response.status).toBe(403);
  });

  it("rejects an unauthenticated request", async () => {
    const member = await createWorkspaceMember();
    mockAnonymousSession();
    const { app } = createApp();

    const response = await app.request(
      `/api/dashboard?workspaceId=${member.workspace.id}`,
    );

    expect(response.status).toBe(401);
  });

  it("caps how many widgets a dashboard holds", async () => {
    const member = await createWorkspaceMember({ role: "member" });
    const dashboard = await seedDashboard(member.workspace.id, member.user.id);

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    for (let i = 0; i < MAX_WIDGETS_PER_DASHBOARD; i += 1) {
      const response = await app.request(
        `/api/dashboard/${dashboard.id}/widget`,
        json({ type: "count", title: `W${i}`, config: {} }),
      );
      expect(response.status).toBe(200);
    }

    const overflow = await app.request(
      `/api/dashboard/${dashboard.id}/widget`,
      json({ type: "count", title: "Uno de mas", config: {} }),
    );

    expect(overflow.status).toBe(422);
  });

  it("refuses a widget pointing at a project of another workspace", async () => {
    const member = await createWorkspaceMember({ role: "member" });
    const dashboard = await seedDashboard(member.workspace.id, member.user.id);

    const stranger = await createWorkspaceMember({ role: "member" });
    const foreign = await createProjectFixture({
      workspaceId: stranger.workspace.id,
    });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request(
      `/api/dashboard/${dashboard.id}/widget`,
      json({
        type: "count",
        title: "Ajeno",
        projectId: foreign.project.id,
        config: {},
      }),
    );

    expect(response.status).toBe(404);
  });

  it("refuses a status breakdown without a project", async () => {
    const member = await createWorkspaceMember({ role: "member" });
    const dashboard = await seedDashboard(member.workspace.id, member.user.id);

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    // `status` compara contra los slugs de las columnas de un proyecto, asi
    // que entre proyectos no significa nada: su sustituto es `done`.
    const response = await app.request(
      `/api/dashboard/${dashboard.id}/widget`,
      json({
        type: "breakdown",
        title: "Por estado",
        config: { groupBy: "status" },
      }),
    );

    expect(response.status).toBe(400);
  });

  it("refuses epic progress without a project", async () => {
    const member = await createWorkspaceMember({ role: "member" });
    const dashboard = await seedDashboard(member.workspace.id, member.user.id);

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request(
      `/api/dashboard/${dashboard.id}/widget`,
      json({ type: "epic_progress", title: "Epicas", config: {} }),
    );

    expect(response.status).toBe(400);
  });

  it("reorders widgets and refuses ids from another dashboard", async () => {
    const member = await createWorkspaceMember({ role: "member" });
    const mine = await seedDashboard(member.workspace.id, member.user.id);
    const other = await seedDashboard(member.workspace.id, member.user.id);

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const ids: string[] = [];
    for (const title of ["A", "B", "C"]) {
      const response = await app.request(
        `/api/dashboard/${mine.id}/widget`,
        json({ type: "count", title, config: {} }),
      );
      ids.push(((await response.json()) as { id: string }).id);
    }

    const reversed = [...ids].reverse();
    const ok = await app.request(`/api/dashboard/${mine.id}/widget/order`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ widgetIds: reversed }),
    });
    expect(ok.status).toBe(200);

    const rows = await db
      .select({
        id: schema.dashboardWidgetTable.id,
        position: schema.dashboardWidgetTable.position,
      })
      .from(schema.dashboardWidgetTable)
      .where(eq(schema.dashboardWidgetTable.dashboardId, mine.id));

    const byId = new Map(rows.map((row) => [row.id, row.position]));
    expect(byId.get(reversed[0])).toBe(0);
    expect(byId.get(reversed[2])).toBe(2);

    const foreign = await app.request(
      `/api/dashboard/${other.id}/widget/order`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ widgetIds: ids }),
      },
    );
    expect(foreign.status).toBe(400);
  });

  it("takes the widgets with it when the dashboard goes", async () => {
    const member = await createWorkspaceMember({ role: "member" });
    const dashboard = await seedDashboard(member.workspace.id, member.user.id);

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    await app.request(
      `/api/dashboard/${dashboard.id}/widget`,
      json({ type: "count", title: "Uno", config: {} }),
    );

    const response = await app.request(`/api/dashboard/${dashboard.id}`, {
      method: "DELETE",
    });
    expect(response.status).toBe(200);

    const widgets = await db
      .select()
      .from(schema.dashboardWidgetTable)
      .where(eq(schema.dashboardWidgetTable.dashboardId, dashboard.id));

    expect(widgets).toHaveLength(0);
  });
});
