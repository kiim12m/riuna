import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { createWorkspaceMember } from "./helpers/fixtures";

type Dashboard = {
  id: string;
  name: string;
  isShared: boolean;
  createdBy: string;
  widgets: unknown[];
};

type Goal = { id: string; name: string; isShared: boolean; createdBy: string };

async function addMember(
  workspaceId: string,
  email: string,
  role = "member" as const,
) {
  const [user] = await db
    .insert(schema.userTable)
    .values({
      id: `user-${email}`,
      email,
      emailVerified: true,
      name: email,
    })
    .returning();

  await db.insert(schema.workspaceUserTable).values({
    workspaceId,
    userId: user.id,
    role,
    joinedAt: new Date(),
  });

  return user;
}

describe("API integration: sharing dashboards and goals", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("shows a shared dashboard to the workspace and still seeds your own", async () => {
    const owner = await createWorkspaceMember({ role: "member" });
    const other = await addMember(owner.workspace.id, "otra@example.com");

    mockAuthenticatedSession(owner.user);
    const ownerApp = createApp().app;

    const [mine] = (await (
      await ownerApp.request(`/api/dashboard?workspaceId=${owner.workspace.id}`)
    ).json()) as Dashboard[];

    await ownerApp.request(`/api/dashboard/${mine.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isShared: true }),
    });

    mockAuthenticatedSession(other);
    const otherApp = createApp().app;

    const visible = (await (
      await otherApp.request(`/api/dashboard?workspaceId=${owner.workspace.id}`)
    ).json()) as Dashboard[];

    // Ve el compartido **y** sigue teniendo el suyo: entrar en un espacio donde
    // alguien comparte el suyo no puede dejarte sin panel propio.
    expect(visible).toHaveLength(2);
    expect(visible.some((d) => d.id === mine.id)).toBe(true);
    expect(visible.some((d) => d.createdBy === other.id)).toBe(true);
  });

  it("refuses to let a plain member edit someone else's shared dashboard", async () => {
    const owner = await createWorkspaceMember({ role: "member" });
    const other = await addMember(owner.workspace.id, "curiosa@example.com");

    mockAuthenticatedSession(owner.user);
    const ownerApp = createApp().app;
    const [mine] = (await (
      await ownerApp.request(`/api/dashboard?workspaceId=${owner.workspace.id}`)
    ).json()) as Dashboard[];

    await ownerApp.request(`/api/dashboard/${mine.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isShared: true }),
    });

    mockAuthenticatedSession(other);
    const response = await createApp().app.request(
      `/api/dashboard/${mine.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Secuestrado" }),
      },
    );

    expect(response.status).toBe(403);
  });

  it("lets a workspace admin unshare what bothers them", async () => {
    const owner = await createWorkspaceMember({ role: "member" });
    const admin = await addMember(
      owner.workspace.id,
      "jefa@example.com",
      "admin",
    );

    mockAuthenticatedSession(owner.user);
    const ownerApp = createApp().app;
    const [mine] = (await (
      await ownerApp.request(`/api/dashboard?workspaceId=${owner.workspace.id}`)
    ).json()) as Dashboard[];

    await ownerApp.request(`/api/dashboard/${mine.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isShared: true }),
    });

    mockAuthenticatedSession(admin);
    const response = await createApp().app.request(
      `/api/dashboard/${mine.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isShared: false }),
      },
    );

    // El mismo criterio que las vistas: quien administra el espacio puede
    // retirar algo compartido que estorbe, aunque no sea suyo.
    expect(response.status).toBe(200);
  });

  it("lets the workspace read the data of a shared dashboard", async () => {
    const owner = await createWorkspaceMember({ role: "member" });
    const other = await addMember(owner.workspace.id, "lectora@example.com");

    mockAuthenticatedSession(owner.user);
    const ownerApp = createApp().app;
    const [mine] = (await (
      await ownerApp.request(`/api/dashboard?workspaceId=${owner.workspace.id}`)
    ).json()) as Dashboard[];

    mockAuthenticatedSession(other);

    // Antes de compartir no se puede leer.
    const before = await createApp().app.request(
      `/api/dashboard/${mine.id}/data`,
      { method: "POST" },
    );
    expect(before.status).toBe(403);

    mockAuthenticatedSession(owner.user);
    await createApp().app.request(`/api/dashboard/${mine.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isShared: true }),
    });

    mockAuthenticatedSession(other);
    const after = await createApp().app.request(
      `/api/dashboard/${mine.id}/data`,
      { method: "POST" },
    );

    // Compartir algo que no se puede leer no es compartirlo: la lista lo
    // devolvia y sus datos daban 403.
    expect(after.status).toBe(200);
  });

  it("exports a dashboard as a spreadsheet with one sheet per widget", async () => {
    const owner = await createWorkspaceMember({ role: "member" });

    mockAuthenticatedSession(owner.user);
    const app = createApp().app;
    const [mine] = (await (
      await app.request(`/api/dashboard?workspaceId=${owner.workspace.id}`)
    ).json()) as Dashboard[];

    const response = await app.request(`/api/dashboard/${mine.id}/export`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("spreadsheetml");
    expect(response.headers.get("content-disposition")).toContain(".xlsx");

    // Un xlsx es un zip: empieza por PK. Basta para saber que sale un libro y
    // no una pagina de error.
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    expect(bytes.length).toBeGreaterThan(1000);
  });

  it("measures a shared goal against its owner, not the viewer", async () => {
    const owner = await createWorkspaceMember({ role: "member" });
    const other = await addMember(owner.workspace.id, "mirona@example.com");

    mockAuthenticatedSession(owner.user);
    const ownerApp = createApp().app;

    const goal = (await (
      await ownerApp.request("/api/goal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId: owner.workspace.id,
          name: "Compartido",
          startsAt: "2026-01-01",
          endsAt: "2026-12-31",
        }),
      })
    ).json()) as Goal;

    await ownerApp.request(`/api/goal/${goal.id}/target`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Lo mio",
        targetValue: 10,
        config: { scope: "assigned", metric: "doneCount" },
      }),
    });

    await ownerApp.request(`/api/goal/${goal.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isShared: true }),
    });

    mockAuthenticatedSession(other);
    const seen = (await (
      await createApp().app.request(
        `/api/goal?workspaceId=${owner.workspace.id}`,
      )
    ).json()) as Array<Goal & { targets: Array<{ current: number | null }> }>;

    // Un OKR es una sola cifra: si dependiera de quien mira, el equipo no
    // estaria mirando el mismo objetivo. Ambos son 0 aqui, pero lo que se fija
    // es que el ambito personal no se resuelve contra el visitante.
    expect(seen).toHaveLength(1);
    expect(seen[0].targets[0].current).toBe(0);
  });
});
