import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../apps/api/src/index";
import { mockAnonymousSession, mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { createWorkspaceMember } from "./helpers/fixtures";

type Reply = { preferences: Record<string, unknown> };

function put(app: ReturnType<typeof createApp>["app"], body: unknown) {
  return app.request("/api/user-preferences", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function get(app: ReturnType<typeof createApp>["app"]) {
  const response = await app.request("/api/user-preferences");
  expect(response.status).toBe(200);
  return ((await response.json()) as Reply).preferences;
}

describe("user preferences", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("is empty until the person saves something", async () => {
    const member = await createWorkspaceMember();
    mockAuthenticatedSession(member.user);

    expect(await get(createApp().app)).toEqual({});
  });

  it("merges what is sent into what was saved instead of replacing it", async () => {
    const member = await createWorkspaceMember();
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    expect((await put(app, { weekStartsOn: 1, viewMode: "list" })).status).toBe(
      200,
    );
    const second = await put(app, { compactMode: true, weekStartsOn: 6 });
    expect(second.status).toBe(200);

    expect(((await second.json()) as Reply).preferences).toEqual({
      weekStartsOn: 6,
      viewMode: "list",
      compactMode: true,
    });
    expect(await get(app)).toEqual({
      weekStartsOn: 6,
      viewMode: "list",
      compactMode: true,
    });
  });

  it("refuses a value outside the lists the interface offers", async () => {
    const member = await createWorkspaceMember();
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    expect((await put(app, { weekStartsOn: 3 })).status).toBe(400);
    expect((await put(app, { viewMode: "grid" })).status).toBe(400);
    expect((await put(app, { compactMode: "yes" })).status).toBe(400);
    expect(await get(app)).toEqual({});
  });

  // Un `jsonb` libre seria un cajon: solo se guarda lo que la interfaz conoce.
  it("drops keys it does not know, theme included", async () => {
    const member = await createWorkspaceMember();
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    expect(
      (await put(app, { theme: "light", cualquierCosa: 1, showLabels: false }))
        .status,
    ).toBe(200);

    expect(await get(app)).toEqual({ showLabels: false });
  });

  it("keeps each person's preferences apart", async () => {
    const ana = await createWorkspaceMember();
    const luis = await createWorkspaceMember();

    mockAuthenticatedSession(ana.user);
    await put(createApp().app, { weekStartsOn: 1 });

    mockAuthenticatedSession(luis.user);
    expect(await get(createApp().app)).toEqual({});
  });

  it("answers 401 without a session", async () => {
    mockAnonymousSession();
    const { app } = createApp();

    expect((await app.request("/api/user-preferences")).status).toBe(401);
    expect((await put(app, { weekStartsOn: 1 })).status).toBe(401);
  });
});
