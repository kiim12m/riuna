import { randomUUID } from "node:crypto";
import type { User } from "better-auth/types";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import {
  leadIdsOf,
  visibleMemberIds,
} from "../../apps/api/src/lead/visibility";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { createWorkspaceMember } from "./helpers/fixtures";

async function person(workspaceId: string, name: string, role = "member") {
  const id = `user-${randomUUID()}`;
  const [user] = await db
    .insert(schema.userTable)
    .values({ id, email: `${id}@example.com`, emailVerified: true, name })
    .returning();
  await db.insert(schema.workspaceUserTable).values({
    workspaceId,
    userId: user.id,
    role,
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

function as(user: User) {
  mockAuthenticatedSession(user);
  return createApp().app;
}

const sorted = (ids: string[]) => [...ids].sort();

/**
 * El responsable de departamento (sub-bloque 5.2 del interludio de
 * productividad, ADR 059): una sola regla decide a quien ve, el interruptor
 * pide permiso para gestionar miembros, y cada persona sabe quien la ve.
 */
describe("lead visibility", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("sees the rest of the teams they lead in this workspace, and nobody else", async () => {
    const { user: owner, workspace } = await createWorkspaceMember({
      role: "owner",
    });
    const ws = workspace.id;
    const lead = await person(ws, "Lucía");
    const ana = await person(ws, "Ana");
    const blas = await person(ws, "Blas");
    const carla = await person(ws, "Carla");
    await team(ws, [
      { user: lead, isLead: true },
      { user: ana },
      { user: blas },
    ]);
    // Otro equipo del espacio, que no lleva.
    await team(ws, [{ user: carla }, { user: owner }]);
    // Un equipo de otro espacio que si lleva: no cuenta aqui, aunque Dani
    // este tambien en este espacio.
    const elsewhere = await createWorkspaceMember({
      role: "owner",
      user: lead,
    });
    const dani = await person(elsewhere.workspace.id, "Dani");
    await db.insert(schema.workspaceUserTable).values({
      workspaceId: ws,
      userId: dani.id,
      role: "member",
      joinedAt: new Date(),
    });
    await team(elsewhere.workspace.id, [
      { user: lead, isLead: true },
      { user: dani },
    ]);

    expect(
      sorted(await visibleMemberIds({ workspaceId: ws, leadUserId: lead.id })),
    ).toEqual(sorted([ana.id, blas.id]));
    expect(await leadIdsOf({ workspaceId: ws, userId: ana.id })).toEqual([
      lead.id,
    ]);
    expect(await leadIdsOf({ workspaceId: ws, userId: carla.id })).toEqual([]);
    expect(await leadIdsOf({ workspaceId: ws, userId: lead.id })).toEqual([]);
    expect(
      await visibleMemberIds({
        workspaceId: elsewhere.workspace.id,
        leadUserId: lead.id,
      }),
    ).toEqual([dani.id]);

    // Quien sale del espacio deja de verse al momento, y quien lo deja
    // tambien deja de ver.
    await db
      .delete(schema.workspaceUserTable)
      .where(
        and(
          eq(schema.workspaceUserTable.workspaceId, ws),
          eq(schema.workspaceUserTable.userId, blas.id),
        ),
      );
    expect(
      await visibleMemberIds({ workspaceId: ws, leadUserId: lead.id }),
    ).toEqual([ana.id]);
    await db
      .delete(schema.workspaceUserTable)
      .where(
        and(
          eq(schema.workspaceUserTable.workspaceId, ws),
          eq(schema.workspaceUserTable.userId, lead.id),
        ),
      );
    expect(
      await visibleMemberIds({ workspaceId: ws, leadUserId: lead.id }),
    ).toEqual([]);
  });

  it("tells each member who their lead is", async () => {
    const { workspace } = await createWorkspaceMember({ role: "owner" });
    const ws = workspace.id;
    const lead = await person(ws, "Lucía");
    const ana = await person(ws, "Ana");
    const blas = await person(ws, "Blas");
    await team(ws, [{ user: lead, isLead: true }, { user: ana }]);

    const mine = await as(ana).request(`/api/lead/my-leads?workspaceId=${ws}`);
    expect(mine.status).toBe(200);
    expect(await mine.json()).toEqual([{ id: lead.id, name: "Lucía" }]);

    const none = await as(blas).request(`/api/lead/my-leads?workspaceId=${ws}`);
    expect(await none.json()).toEqual([]);
  });

  it("marks a lead only with the permission to manage members, and only inside the workspace", async () => {
    const { user: admin, workspace } = await createWorkspaceMember({
      role: "admin",
    });
    const ws = workspace.id;
    const lead = await person(ws, "Lucía");
    const ana = await person(ws, "Ana");
    const outsider = await person(ws, "Fuera del equipo");
    const obras = await team(ws, [{ user: lead }, { user: ana }]);
    const other = await createWorkspaceMember({ role: "owner" });
    const foreign = await team(other.workspace.id, [{ user: other.user }]);

    const put = (user: User, body: Record<string, unknown>) =>
      as(user).request(`/api/team-lead?workspaceId=${ws}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

    expect(
      (await put(ana, { teamId: obras.id, userId: lead.id, isLead: true }))
        .status,
    ).toBe(403);
    expect(
      (
        await put(admin, {
          teamId: foreign.id,
          userId: other.user.id,
          isLead: true,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await put(admin, {
          teamId: obras.id,
          userId: outsider.id,
          isLead: true,
        })
      ).status,
    ).toBe(404);

    const marked = await put(admin, {
      teamId: obras.id,
      userId: lead.id,
      isLead: true,
    });
    expect(marked.status).toBe(200);
    expect(
      await visibleMemberIds({ workspaceId: ws, leadUserId: lead.id }),
    ).toEqual([ana.id]);

    const leads = await as(ana).request(`/api/team-lead?workspaceId=${ws}`);
    expect(await leads.json()).toEqual([{ teamId: obras.id, userId: lead.id }]);

    await put(admin, { teamId: obras.id, userId: lead.id, isLead: false });
    expect(
      await visibleMemberIds({ workspaceId: ws, leadUserId: lead.id }),
    ).toEqual([]);
  });
});
