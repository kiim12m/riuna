import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import createNotification from "../../apps/api/src/notification/controllers/create-notification";
import { resetTestDatabase } from "./helpers/database";
import { createWorkspaceMember } from "./helpers/fixtures";

// Lo que es de un espacio solo sale por los canales si la regla de ese espacio
// lo deja. La revision de la Fase 9 saco la regla a su propia funcion para que
// las alertas de la instancia, que no son de ningun espacio, no la necesiten;
// esto vigila que para el resto siga igual.

let sent: string[] = [];

beforeEach(async () => {
  await resetTestDatabase();
  vi.stubEnv("RIUNA_ALLOW_PRIVATE_WEBHOOK_DESTINATIONS", "true");
  sent = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    sent.push(String(input));
    return new Response("ok");
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function memberWithNtfy() {
  const member = await createWorkspaceMember();
  await db.insert(schema.userNotificationPreferenceTable).values({
    userId: member.user.id,
    ntfyEnabled: true,
    ntfyServerUrl: "https://ntfy.example.com",
    ntfyTopic: "riuna",
  });
  return member;
}

const notifyAboutWorkspace = (userId: string, workspaceId: string) =>
  createNotification({
    userId,
    type: "workspace_member_added",
    title: "Te han añadido",
    content: "Te han añadido a un espacio",
    resourceType: "workspace",
    resourceId: workspaceId,
  });

describe("notification delivery for workspace notifications", () => {
  it("stays in the bell without a rule for the workspace", async () => {
    const member = await memberWithNtfy();

    await notifyAboutWorkspace(member.user.id, member.workspace.id);
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(sent).toEqual([]);
  });

  it("goes out through the channels the workspace rule turns on", async () => {
    const member = await memberWithNtfy();
    await db.insert(schema.userNotificationWorkspaceRuleTable).values({
      userId: member.user.id,
      workspaceId: member.workspace.id,
      ntfyEnabled: true,
    });

    await notifyAboutWorkspace(member.user.id, member.workspace.id);

    await vi.waitFor(() =>
      expect(sent).toEqual(["https://ntfy.example.com/riuna"]),
    );
  });
});
