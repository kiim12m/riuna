import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { createApiKey, mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { createWorkspaceMember } from "./helpers/fixtures";

type User = typeof schema.userTable.$inferSelect;
type SessionRow = {
  id: string;
  current: boolean;
  userAgent: string | null;
  impersonated: boolean;
};

const HOUR = 60 * 60 * 1000;
const CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";

function as(user: User) {
  mockAuthenticatedSession(user);
  return createApp().app;
}

// La sesion simulada se llama `session-<id>` (helpers/auth.ts): se siembra con
// ese id para que la API la reconozca como «esta».
async function seedSessions(user: User) {
  const now = Date.now();
  const row = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    token: `token-${id}`,
    userId: user.id,
    expiresAt: new Date(now + 24 * HOUR),
    updatedAt: new Date(now),
    ...extra,
  });
  await db.insert(schema.sessionTable).values([
    row(`session-${user.id}`, {
      userAgent: CHROME,
      ipAddress: "100.64.12.7",
    }),
    row(`phone-${user.id}`, { updatedAt: new Date(now - 3 * HOUR) }),
    row(`old-${user.id}`, { expiresAt: new Date(now - HOUR) }),
    row(`admin-${user.id}`, { impersonatedBy: user.id }),
  ]);
}

async function sessionIds(userId: string) {
  const rows = await db
    .select({ id: schema.sessionTable.id })
    .from(schema.sessionTable)
    .where(eq(schema.sessionTable.userId, userId));
  return rows.map((row) => row.id).sort();
}

describe("API integration: active sessions (ADR 079)", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("lists my live sessions, this one first, without their tokens", async () => {
    const { user } = await createWorkspaceMember({ userName: "Ana" });
    await seedSessions(user);

    const response = await as(user).request("/api/session");
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toContain("token-");

    const sessions = JSON.parse(text) as SessionRow[];
    expect(sessions.map((session) => session.id)).toEqual([
      `session-${user.id}`,
      `admin-${user.id}`,
      `phone-${user.id}`,
    ]);
    expect(sessions[0]).toMatchObject({ current: true, userAgent: CHROME });
    expect(sessions[1]).toMatchObject({ current: false, impersonated: true });
  });

  it("closes one other session, never someone else's nor this one", async () => {
    const { user } = await createWorkspaceMember({ userName: "Ana" });
    const other = await createWorkspaceMember({ userName: "Luis" });
    await seedSessions(user);
    await seedSessions(other.user);
    const app = as(user);

    const closed = await app.request(`/api/session/phone-${user.id}`, {
      method: "DELETE",
    });
    expect(closed.status).toBe(200);
    expect(await sessionIds(user.id)).not.toContain(`phone-${user.id}`);

    const foreign = await app.request(`/api/session/phone-${other.user.id}`, {
      method: "DELETE",
    });
    expect(foreign.status).toBe(404);
    expect(await sessionIds(other.user.id)).toContain(`phone-${other.user.id}`);

    const current = await app.request(`/api/session/session-${user.id}`, {
      method: "DELETE",
    });
    expect(current.status).toBe(400);
  });

  it("closes every other session and keeps this one", async () => {
    const { user } = await createWorkspaceMember({ userName: "Ana" });
    await seedSessions(user);

    const response = await as(user).request("/api/session/others", {
      method: "DELETE",
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ revoked: 3 });
    expect(await sessionIds(user.id)).toEqual([`session-${user.id}`]);
  });

  it("refuses an API key: it is not a session", async () => {
    const { user } = await createWorkspaceMember({ userName: "Ana" });
    await seedSessions(user);
    const key = await createApiKey(user.id);

    const response = await createApp().app.request("/api/session/others", {
      method: "DELETE",
      headers: { "x-api-key": key },
    });
    expect(response.status).toBe(403);
    expect(await sessionIds(user.id)).toHaveLength(4);
  });
});
