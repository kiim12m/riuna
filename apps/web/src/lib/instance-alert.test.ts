import enUS from "@i18n/en-US.json";
import { describe, expect, it } from "vitest";
import type { Notification } from "@/types/notification";
import { instanceProblemText } from "./instance-alert";
import { getNotificationContent, getNotificationTitle } from "./notification";

// Revision de la Fase 9, hallazgo 13: los avisos de la instancia salian en
// espanol fijo, sin pasar por las traducciones. Se resuelve contra el en-US de
// verdad para que una clave que falte se vea.
function t(key: string, options: Record<string, unknown> = {}) {
  const [namespace = "", path = ""] = key.split(":");
  let node: unknown = (enUS as Record<string, unknown>)[namespace];
  for (const part of path.split(".")) {
    node = (node as Record<string, unknown> | undefined)?.[part];
  }
  const template =
    typeof node === "string" ? node : String(options.defaultValue ?? key);
  return template.replace(/{{(\w+)}}/g, (_, name: string) =>
    String(options[name] ?? ""),
  );
}

function alert(
  eventData: Record<string, unknown>,
  stored = { title: "Riuna · algo", content: "Texto de la API" },
): Notification {
  return {
    id: "notification-1",
    userId: "user-1",
    type: "instance_alert",
    eventData,
    isRead: false,
    createdAt: "2026-10-12T10:00:00.000Z",
    updatedAt: "2026-10-12T10:00:00.000Z",
    ...stored,
  } as unknown as Notification;
}

describe("instance alerts in the bell", () => {
  it("translates an open alert from its kind and params", () => {
    const item = alert({
      key: "job.failing:automations",
      area: "job",
      job: "automations",
      kind: "jobFailing",
      params: { job: "automations", failures: 3, error: "timeout" },
    });

    expect(getNotificationTitle(item, t)).toBe("Riuna · job “Automations”");
    expect(getNotificationContent(item, t)).toBe(
      "The scheduled job “Automations” has failed 3 times in a row. Last error: timeout",
    );
  });

  it("translates a resolved alert from its area", () => {
    const item = alert({
      key: "backup.stale",
      area: "backups",
      resolved: true,
    });

    expect(getNotificationTitle(item, t)).toBe("Riuna · resolved");
    expect(getNotificationContent(item, t)).toBe(
      "Back to normal: local backups.",
    );
  });

  it("falls back to what the API stored for alerts sent before", () => {
    const item = alert({ key: "backup.stale" });

    expect(getNotificationTitle(item, t)).toBe("Riuna · algo");
    expect(getNotificationContent(item, t)).toBe("Texto de la API");
  });
});

describe("instanceProblemText", () => {
  it("fills in the numbers", () => {
    expect(
      instanceProblemText(
        { kind: "backupStale", params: { hours: 30, every: 24 } },
        "fallback",
        t,
      ),
    ).toBe(
      "The latest database backup is 30 h old, and one is expected every 24 h.",
    );
  });

  it("keeps the server text for a kind this web does not know", () => {
    expect(
      instanceProblemText(
        { kind: "somethingNew", params: {} },
        "Algo nuevo",
        t,
      ),
    ).toBe("Algo nuevo");
  });
});
