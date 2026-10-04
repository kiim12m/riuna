import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { createWorkspaceMember } from "./helpers/fixtures";

type Item = { id: string; createdAt: string; isRead: boolean };

/** 120 avisos, uno por minuto hacia atras; cada tercero ya leido. */
async function seed(userId: string, total = 120) {
  const now = Date.now();
  await db.insert(schema.notificationTable).values(
    Array.from({ length: total }, (_, index) => ({
      userId,
      title: `Aviso ${index}`,
      type: "info",
      isRead: index % 3 === 0,
      createdAt: new Date(now - index * 60_000),
    })),
  );
}

async function list(app: ReturnType<typeof createApp>["app"], query = "") {
  const response = await app.request(`/api/notification${query}`);
  return { status: response.status, items: (await response.json()) as Item[] };
}

describe("notification paging", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("keeps answering the 50 newest when nothing is asked", async () => {
    const member = await createWorkspaceMember();
    await seed(member.user.id);
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const { items } = await list(app);

    expect(items).toHaveLength(50);
    expect(items[0]?.createdAt > (items.at(-1)?.createdAt ?? "")).toBe(true);
  });

  it("walks the whole history page by page without repeating or skipping one", async () => {
    const member = await createWorkspaceMember();
    await seed(member.user.id);
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const seen: string[] = [];
    let before: string | undefined;
    for (let page = 0; page < 5; page++) {
      const { items } = await list(
        app,
        `?limit=50${before ? `&before=${encodeURIComponent(before)}` : ""}`,
      );
      if (items.length === 0) break;
      seen.push(...items.map((item) => item.id));
      before = items.at(-1)?.createdAt;
    }

    expect(seen).toHaveLength(120);
    expect(new Set(seen).size).toBe(120);
  });

  it("filters the unread ones, in pages as well", async () => {
    const member = await createWorkspaceMember();
    await seed(member.user.id);
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const { items } = await list(app, "?unread=true&limit=100");

    // 120 avisos y cada tercero leido: 80 sin leer.
    expect(items).toHaveLength(80);
    expect(items.every((item) => !item.isRead)).toBe(true);
  });

  it("counts every unread one, not just the first page", async () => {
    const member = await createWorkspaceMember();
    await seed(member.user.id);
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request("/api/notification/unread-count");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ count: 80 });
  });

  it("never reaches the notifications of someone else", async () => {
    const member = await createWorkspaceMember();
    const other = await createWorkspaceMember();
    await seed(other.user.id, 10);
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    expect((await list(app, "?limit=100")).items).toHaveLength(0);
    const count = await app.request("/api/notification/unread-count");
    expect(await count.json()).toEqual({ count: 0 });
  });

  it("refuses a page size or a cursor that make no sense", async () => {
    const member = await createWorkspaceMember();
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    expect((await list(app, "?limit=1000")).status).toBe(400);
    expect((await list(app, "?limit=0")).status).toBe(400);
    expect((await list(app, "?before=ayer")).status).toBe(400);
  });
});
