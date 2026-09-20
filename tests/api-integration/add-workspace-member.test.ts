import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { auth } from "../../apps/api/src/auth";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { grantPendingInvitations } from "../../apps/api/src/utils/grant-pending-invitations";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { createWorkspaceMember } from "./helpers/fixtures";

beforeEach(async () => {
  await resetTestDatabase();
});

function addMember(
  workspaceId: string,
  body: { email: string; role?: string },
) {
  const { app } = createApp();

  return app.request(`/api/workspace/${workspaceId}/member`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("API integration: adding a workspace member", () => {
  it("makes an existing user a member straight away, with no invitation", async () => {
    const { user: admin, workspace } = await createWorkspaceMember({
      role: "admin",
    });
    const { user: target } = await createWorkspaceMember({ role: "member" });

    mockAuthenticatedSession(admin);
    const response = await addMember(workspace.id, { email: target.email });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "added",
      userId: target.id,
    });

    const members = await db
      .select()
      .from(schema.workspaceUserTable)
      .where(
        and(
          eq(schema.workspaceUserTable.workspaceId, workspace.id),
          eq(schema.workspaceUserTable.userId, target.id),
        ),
      );
    expect(members).toHaveLength(1);

    // Nada que aceptar: no se crea invitacion en este camino.
    const invitations = await db
      .select()
      .from(schema.invitationTable)
      .where(eq(schema.invitationTable.workspaceId, workspace.id));
    expect(invitations).toHaveLength(0);
  });

  it("refuses a member without the invite permission", async () => {
    const { user, workspace } = await createWorkspaceMember({ role: "member" });
    const { user: target } = await createWorkspaceMember({});

    mockAuthenticatedSession(user);
    const response = await addMember(workspace.id, { email: target.email });

    expect(response.status).toBe(403);
  });

  it("refuses to grant the owner role", async () => {
    const { user: admin, workspace } = await createWorkspaceMember({
      role: "admin",
    });
    const { user: target } = await createWorkspaceMember({});

    mockAuthenticatedSession(admin);
    const response = await addMember(workspace.id, {
      email: target.email,
      role: "owner",
    });

    expect(response.status).toBe(400);
  });

  it("creates an invitation when the email has no account yet", async () => {
    const { user: admin, workspace } = await createWorkspaceMember({
      role: "admin",
    });
    const email = `sin-cuenta-${randomUUID()}@example.com`;

    mockAuthenticatedSession(admin);
    const response = await addMember(workspace.id, { email });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "invited" });

    const invitations = await db
      .select()
      .from(schema.invitationTable)
      .where(eq(schema.invitationTable.email, email));
    expect(invitations).toHaveLength(1);
    expect(invitations[0].status).toBe("pending");
  });

  it("grants the promised access once the account exists, matching by email alone", async () => {
    const { user: inviter, workspace } = await createWorkspaceMember({
      role: "owner",
    });
    const email = `tardio-${randomUUID()}@example.com`;

    await db.insert(schema.invitationTable).values({
      workspaceId: workspace.id,
      inviterId: inviter.id,
      email: email.toLowerCase(),
      role: "member",
      status: "pending",
      expiresAt: new Date(Date.now() + 86_400_000),
    });

    const [newUser] = await db
      .insert(schema.userTable)
      .values({
        id: `user-${randomUUID()}`,
        email: email.toLowerCase(),
        emailVerified: true,
        name: "Alta tardia",
      })
      .returning();

    // Sin pasar el id de la invitacion: es justo lo que la vuelve robusta
    // para quien entra por enlace magico o por OAuth.
    const granted = await grantPendingInvitations(newUser, (body) =>
      auth.api.addMember({ body }),
    );

    expect(granted).toBe(1);

    const members = await db
      .select()
      .from(schema.workspaceUserTable)
      .where(
        and(
          eq(schema.workspaceUserTable.workspaceId, workspace.id),
          eq(schema.workspaceUserTable.userId, newUser.id),
        ),
      );
    expect(members).toHaveLength(1);

    const invitations = await db
      .select()
      .from(schema.invitationTable)
      .where(eq(schema.invitationTable.email, email.toLowerCase()));
    expect(invitations[0].status).toBe("accepted");
  });
});
