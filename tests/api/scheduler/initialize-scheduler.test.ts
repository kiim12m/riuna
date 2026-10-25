import { afterEach, describe, expect, it, vi } from "vitest";
import { log } from "../../../apps/api/src/utils/log";

// Los trabajos se sustituyen por dobles: aqui solo importa si el planificador
// llega a programarlos, no lo que hacen.
vi.mock("../../../apps/api/src/automation/scheduled", () => ({
  checkAutomations: vi.fn(),
}));
vi.mock("../../../apps/api/src/recurrence/generate", () => ({
  generateRecurringTasks: vi.fn(),
}));
vi.mock("../../../apps/api/src/scheduler/due-date-reminders", () => ({
  checkDueDateReminders: vi.fn(),
}));
vi.mock("../../../apps/api/src/scheduler/leader-lock", () => ({
  HELD_ELSEWHERE: { degraded: false, skipped: true },
  withJobLease: vi.fn(),
}));
vi.mock("../../../apps/api/src/scheduler/project-webhook-reminders", () => ({
  checkProjectWebhookReminders: vi.fn(),
}));
vi.mock("../../../apps/api/src/task-reminder/send-due", () => ({
  sendDueTaskReminders: vi.fn(),
}));

const { initializeScheduler, shutdownScheduler } = await import(
  "../../../apps/api/src/scheduler"
);

describe("initializeScheduler", () => {
  afterEach(() => {
    shutdownScheduler();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("starts the scheduled jobs", () => {
    vi.spyOn(log, "info").mockImplementation(() => {});

    expect(initializeScheduler()).toBeGreaterThan(0);
  });

  // Una instancia restaurada para un simulacro no puede mandar el stand-up ni
  // los recordatorios de la de verdad (ADR 072).
  it("starts none with RIUNA_DISABLE_SCHEDULER=true", () => {
    vi.stubEnv("RIUNA_DISABLE_SCHEDULER", "true");
    vi.spyOn(log, "warn").mockImplementation(() => {});

    expect(initializeScheduler()).toBe(0);
  });
});
