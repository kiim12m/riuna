import { randomUUID } from "node:crypto";
import type { User } from "better-auth/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { subscribeToEvent } from "../../apps/api/src/events";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { createWorkspaceMember } from "./helpers/fixtures";

type Changed = { workspaceId: string; userIds: string[] };

// `subscribeToEvent` no tiene baja: un solo oyente para toda la batería, que
// cada prueba vacia antes de actuar.
const received: Changed[] = [];
subscribeToEvent<Changed>("availability.changed", async (data) => {
  received.push(data);
});

async function person(workspaceId: string, name: string) {
  const id = `user-${randomUUID()}`;
  const [user] = await db
    .insert(schema.userTable)
    .values({ id, email: `${id}@example.com`, emailVerified: true, name })
    .returning();
  await db.insert(schema.workspaceUserTable).values({
    workspaceId,
    userId: user.id,
    role: "member",
    joinedAt: new Date(),
  });
  return user;
}

async function team(
  workspaceId: string,
  members: { user: User; isLead?: boolean }[],
) {
  const [row] = await db
    .insert(schema.teamTable)
    .values({
      id: `team-${randomUUID()}`,
      name: "Obras",
      workspaceId,
      createdAt: new Date(),
    })
    .returning();
  for (const member of members) {
    await db.insert(schema.teamMemberTable).values({
      id: `tm-${randomUUID()}`,
      teamId: row.id,
      userId: member.user.id,
      isLead: member.isLead ?? false,
      createdAt: new Date(),
    });
  }
  return row;
}

async function call(user: User, method: string, path: string, body?: unknown) {
  mockAuthenticatedSession(user);
  return createApp().app.request(path, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
}

const sorted = (ids: string[]) => [...ids].sort();

describe("availability.changed", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    received.length = 0;
  });

  it("reaches the whole workspace when a holiday is added or removed, and nobody from another one", async () => {
    const admin = await createWorkspaceMember({ role: "admin" });
    const workspaceId = admin.workspace.id;
    const colleague = await person(workspaceId, "Compañera");
    const other = await createWorkspaceMember({ role: "member" });

    const created = await call(
      admin.user,
      "POST",
      `/api/availability/holidays?workspaceId=${workspaceId}`,
      { day: "2026-12-25", name: "Navidad" },
    );
    expect(created.status).toBe(200);
    const { id } = (await created.json()) as { id: string };

    await vi.waitFor(() => expect(received).toHaveLength(1));
    expect(received[0]?.workspaceId).toBe(workspaceId);
    expect(sorted(received[0]?.userIds ?? [])).toEqual(
      sorted([admin.user.id, colleague.id]),
    );
    expect(received[0]?.userIds).not.toContain(other.user.id);

    const removed = await call(
      admin.user,
      "DELETE",
      `/api/availability/holidays/${id}?workspaceId=${workspaceId}`,
    );
    expect(removed.status).toBe(200);
    await vi.waitFor(() => expect(received).toHaveLength(2));
  });

  it("reaches the person and their lead, and not the rest of the team, when an absence changes", async () => {
    const owner = await createWorkspaceMember({ role: "member" });
    const workspaceId = owner.workspace.id;
    const lead = await person(workspaceId, "Responsable");
    const peer = await person(workspaceId, "Compañero");
    await team(workspaceId, [
      { user: lead, isLead: true },
      { user: owner.user },
      { user: peer },
    ]);

    const created = await call(
      owner.user,
      "POST",
      `/api/availability/time-off?workspaceId=${workspaceId}`,
      { startsOn: "2026-10-12", endsOn: "2026-10-14", note: null },
    );
    expect(created.status).toBe(200);
    const { id } = (await created.json()) as { id: string };

    await vi.waitFor(() => expect(received).toHaveLength(1));
    expect(sorted(received[0]?.userIds ?? [])).toEqual(
      sorted([owner.user.id, lead.id]),
    );

    await call(
      owner.user,
      "DELETE",
      `/api/availability/time-off/${id}?workspaceId=${workspaceId}`,
    );
    await vi.waitFor(() => expect(received).toHaveLength(2));
  });

  it("reaches the whole team when its lead is marked", async () => {
    const admin = await createWorkspaceMember({ role: "admin" });
    const workspaceId = admin.workspace.id;
    const lead = await person(workspaceId, "Responsable");
    const peer = await person(workspaceId, "Compañero");
    const outsider = await person(workspaceId, "De otro equipo");
    const row = await team(workspaceId, [{ user: lead }, { user: peer }]);

    const response = await call(
      admin.user,
      "PUT",
      `/api/team-lead?workspaceId=${workspaceId}`,
      { teamId: row.id, userId: lead.id, isLead: true },
    );
    expect(response.status).toBe(200);

    await vi.waitFor(() => expect(received).toHaveLength(1));
    expect(sorted(received[0]?.userIds ?? [])).toEqual(
      sorted([lead.id, peer.id]),
    );
    expect(received[0]?.userIds).not.toContain(outsider.id);
  });
});
