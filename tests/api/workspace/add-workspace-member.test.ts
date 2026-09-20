import { beforeEach, describe, expect, it, vi } from "vitest";

const selectQueue: unknown[][] = [];
const mockAddMember = vi.fn();
const mockCreateInvitation = vi.fn();
const mockPublishEvent = vi.fn();

vi.mock("../../../apps/api/src/database", () => ({
  default: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(selectQueue.shift() ?? []),
        }),
      }),
    }),
  },
}));

vi.mock("../../../apps/api/src/auth", () => ({
  auth: {
    api: {
      addMember: (...args: unknown[]) => mockAddMember(...args),
      createInvitation: (...args: unknown[]) => mockCreateInvitation(...args),
    },
  },
}));

vi.mock("../../../apps/api/src/events", () => ({
  publishEvent: (...args: unknown[]) => mockPublishEvent(...args),
}));

import addWorkspaceMember from "../../../apps/api/src/workspace/controllers/add-workspace-member";

const WORKSPACE = [{ name: "Operaciones" }];
const headers = new Headers();

function callWith(
  overrides: Partial<Parameters<typeof addWorkspaceMember>[0]>,
) {
  return addWorkspaceMember({
    workspaceId: "ws-1",
    email: "quim@example.com",
    role: "member",
    headers,
    ...overrides,
  });
}

beforeEach(() => {
  selectQueue.length = 0;
  vi.clearAllMocks();
});

describe("addWorkspaceMember", () => {
  it("refuses to grant the owner role", async () => {
    await expect(callWith({ role: "owner" })).rejects.toMatchObject({
      status: 400,
    });

    // Ni siquiera debe llegar a mirar la base de datos.
    expect(mockAddMember).not.toHaveBeenCalled();
    expect(mockCreateInvitation).not.toHaveBeenCalled();
  });

  it("adds an existing user straight away, with no invitation", async () => {
    selectQueue.push(WORKSPACE, [{ id: "user-1" }], []);

    const result = await callWith({});

    expect(result).toEqual({ status: "added", userId: "user-1" });
    expect(mockCreateInvitation).not.toHaveBeenCalled();
    expect(mockAddMember).toHaveBeenCalledWith({
      body: { userId: "user-1", organizationId: "ws-1", role: "member" },
      headers,
    });
    expect(mockPublishEvent).toHaveBeenCalledWith("workspace.member.added", {
      workspaceId: "ws-1",
      workspaceName: "Operaciones",
      userId: "user-1",
    });
  });

  it("invites when the email has no account yet", async () => {
    selectQueue.push(WORKSPACE, []);
    mockCreateInvitation.mockResolvedValue({ id: "inv-1" });

    const result = await callWith({ email: "nueva@example.com" });

    expect(result).toEqual({ status: "invited", invitationId: "inv-1" });
    expect(mockAddMember).not.toHaveBeenCalled();
    // Nadie recibe notificacion todavia: la cuenta aun no existe.
    expect(mockPublishEvent).not.toHaveBeenCalled();
  });

  it("normalizes the email before looking it up", async () => {
    selectQueue.push(WORKSPACE, []);
    mockCreateInvitation.mockResolvedValue({ id: "inv-2" });

    await callWith({ email: "  QUIM@Example.COM  " });

    expect(mockCreateInvitation).toHaveBeenCalledWith({
      body: {
        email: "quim@example.com",
        role: "member",
        organizationId: "ws-1",
      },
      headers,
    });
  });

  it("reports a clearer conflict when they are already a member", async () => {
    selectQueue.push(WORKSPACE, [{ id: "user-1" }], [{ id: "member-1" }]);

    await expect(callWith({})).rejects.toMatchObject({ status: 409 });
    expect(mockAddMember).not.toHaveBeenCalled();
  });

  it("fails when the workspace does not exist", async () => {
    selectQueue.push([]);

    await expect(callWith({})).rejects.toMatchObject({ status: 404 });
  });
});
