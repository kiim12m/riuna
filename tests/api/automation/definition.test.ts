import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Action } from "../../../apps/api/src/automation/definition";
import { requiredPermissions } from "../../../apps/api/src/automation/permissions";
import {
  publicActions,
  sealActions,
} from "../../../apps/api/src/automation/secrets";

describe("requiredPermissions", () => {
  it("a project rule needs project:update", () => {
    expect(requiredPermissions("p1", [{ type: "notify" }])).toEqual({
      project: ["update"],
    });
  });

  it("a project rule that sends data out also needs manage_settings", () => {
    expect(requiredPermissions("p1", [{ type: "webhook" }])).toEqual({
      project: ["update"],
      workspace: ["manage_settings"],
    });
    expect(requiredPermissions("p1", [{ type: "chat" }])).toEqual({
      project: ["update"],
      workspace: ["manage_settings"],
    });
  });

  it("a workspace rule needs manage_settings", () => {
    expect(requiredPermissions(null, [{ type: "notify" }])).toEqual({
      workspace: ["manage_settings"],
    });
  });
});

describe("action secrets", () => {
  const previous = process.env.NOTIFICATION_SECRET_ENCRYPTION_KEY;
  beforeAll(() => {
    process.env.NOTIFICATION_SECRET_ENCRYPTION_KEY = "unit-test-key";
  });
  afterAll(() => {
    process.env.NOTIFICATION_SECRET_ENCRYPTION_KEY = previous;
  });

  const webhook = (secret?: string): Action => ({
    id: "w1",
    type: "webhook",
    url: "https://example.com/hook",
    ...(secret === undefined ? {} : { secret }),
  });

  it("encrypts a new secret and keeps it when the edit leaves it out", () => {
    const [sealed] = sealActions([webhook("s3cret")]);
    const secret = sealed?.type === "webhook" ? sealed.secret : undefined;
    expect(secret?.startsWith("enc:v1:")).toBe(true);

    const [kept] = sealActions([webhook()], [sealed as Action]);
    expect(kept?.type === "webhook" && kept.secret).toBe(secret);

    const [cleared] = sealActions([webhook("")], [sealed as Action]);
    expect(cleared?.type === "webhook" && "secret" in cleared).toBe(false);
  });

  it("does not carry a secret over to a different action", () => {
    const [sealed] = sealActions([webhook("s3cret")]);
    const [other] = sealActions(
      [{ ...webhook(), id: "w2" }],
      [sealed as Action],
    );
    expect(other?.type === "webhook" && other.secret).toBeUndefined();
  });

  it("never returns secrets, nor the URL that is the chat credential", () => {
    const stored = sealActions([
      webhook("s3cret"),
      {
        id: "c1",
        type: "chat",
        channel: "slack",
        message: "Hola",
        destination: { webhookUrl: "https://hooks.slack.com/services/T/B/X" },
      },
    ]);

    const shown = JSON.stringify(publicActions(stored));
    expect(shown).not.toContain("enc:v1:");
    expect(shown).not.toContain("hooks.slack.com");
    expect(publicActions(stored)).toMatchObject([
      { hasSecret: true },
      { destination: { hasWebhookUrl: true, hasBotToken: false } },
    ]);
  });

  it("refuses to store a secret without the encryption key", () => {
    process.env.NOTIFICATION_SECRET_ENCRYPTION_KEY = "";
    expect(() => sealActions([webhook("s3cret")])).toThrow(
      /NOTIFICATION_SECRET_ENCRYPTION_KEY/,
    );
    process.env.NOTIFICATION_SECRET_ENCRYPTION_KEY = "unit-test-key";
  });
});
