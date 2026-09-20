import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetUserPendingInvitations = vi.fn();
const mockPublishEvent = vi.fn();
const updatedIds: unknown[] = [];

vi.mock("../../../apps/api/src/database", () => ({
  default: {
    update: () => ({
      set: (values: unknown) => ({
        where: (condition: unknown) => {
          updatedIds.push({ values, condition });
          return Promise.resolve();
        },
      }),
    }),
  },
  schema: { invitationTable: { id: "invitation.id" } },
}));

vi.mock("../../../apps/api/src/utils/check-registration-allowed", () => ({
  getUserPendingInvitations: (...args: unknown[]) =>
    mockGetUserPendingInvitations(...args),
}));

vi.mock("../../../apps/api/src/events", () => ({
  publishEvent: (...args: unknown[]) => mockPublishEvent(...args),
}));

import { grantPendingInvitations } from "../../../apps/api/src/utils/grant-pending-invitations";

const USER = { id: "user-1", email: "quim@example.com" };

beforeEach(() => {
  updatedIds.length = 0;
  vi.clearAllMocks();
});

describe("grantPendingInvitations", () => {
  it("does nothing when there is no invitation waiting", async () => {
    mockGetUserPendingInvitations.mockResolvedValue([]);

    expect(await grantPendingInvitations(USER, vi.fn())).toBe(0);
  });

  it("looks the invitations up by email, not by id", async () => {
    mockGetUserPendingInvitations.mockResolvedValue([]);

    await grantPendingInvitations(USER, vi.fn());

    // Quien entra por enlace magico o por OAuth nunca reenvia el id de la
    // invitacion, asi que buscarla por correo es lo que la rescata.
    expect(mockGetUserPendingInvitations).toHaveBeenCalledWith(
      "quim@example.com",
    );
  });

  it("grants membership, closes the invitation and announces it", async () => {
    mockGetUserPendingInvitations.mockResolvedValue([
      {
        id: "inv-1",
        workspaceId: "ws-1",
        workspaceName: "Operaciones",
        role: "admin",
      },
    ]);
    const addMember = vi.fn().mockResolvedValue(undefined);

    expect(await grantPendingInvitations(USER, addMember)).toBe(1);

    expect(addMember).toHaveBeenCalledWith({
      userId: "user-1",
      organizationId: "ws-1",
      role: "admin",
    });
    expect(updatedIds).toHaveLength(1);
    expect(updatedIds[0]).toMatchObject({ values: { status: "accepted" } });
    expect(mockPublishEvent).toHaveBeenCalledWith("workspace.member.added", {
      workspaceId: "ws-1",
      workspaceName: "Operaciones",
      userId: "user-1",
    });
  });

  it("falls back to member when the invitation carries no role", async () => {
    mockGetUserPendingInvitations.mockResolvedValue([
      { id: "inv-1", workspaceId: "ws-1", workspaceName: "Ops", role: null },
    ]);
    const addMember = vi.fn().mockResolvedValue(undefined);

    await grantPendingInvitations(USER, addMember);

    expect(addMember).toHaveBeenCalledWith(
      expect.objectContaining({ role: "member" }),
    );
  });

  it("grants every pending invitation, not just the first", async () => {
    mockGetUserPendingInvitations.mockResolvedValue([
      { id: "inv-1", workspaceId: "ws-1", workspaceName: "Uno", role: null },
      { id: "inv-2", workspaceId: "ws-2", workspaceName: "Dos", role: null },
    ]);
    const addMember = vi.fn().mockResolvedValue(undefined);

    expect(await grantPendingInvitations(USER, addMember)).toBe(2);
    expect(addMember).toHaveBeenCalledTimes(2);
    expect(mockPublishEvent).toHaveBeenCalledTimes(2);
  });
});
