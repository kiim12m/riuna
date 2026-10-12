import type { QueryKey } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import {
  DEBOUNCED_USER_MESSAGES,
  userMessageInvalidations,
} from "./user-ws-invalidations";

/**
 * Una clave invalidada cubre todas las que empiezan por ella, igual que
 * `invalidateQueries({ queryKey })` en TanStack Query.
 */
function covers(keys: QueryKey[], target: QueryKey) {
  return keys.some((key) => key.every((part, index) => part === target[index]));
}

describe("userMessageInvalidations", () => {
  // La guarda de la ADR 048: una tarea recien asignada no llegaba a Hoy ni a
  // "Sin planificar" porque este mensaje solo invalidaba `my-work`.
  it("refreshes Today, the Planner and the Schedule when a task becomes yours", () => {
    const keys = userMessageInvalidations({ type: "MY_WORK_INVALIDATED" });

    expect(covers(keys, ["today", "ws-1"])).toBe(true);
    expect(covers(keys, ["planner", "ws-1", 15])).toBe(true);
    expect(covers(keys, ["schedule", "ws-1", undefined, 7])).toBe(true);
    expect(covers(keys, ["my-work", "counts", "ws-1"])).toBe(true);
    expect(covers(keys, ["my-work", "search", { workspaceId: "ws-1" }])).toBe(
      true,
    );
    expect(covers(keys, ["dashboard-data", "d-1"])).toBe(true);
  });

  it("refreshes the Planner's logged time when the timer changes", () => {
    const keys = userMessageInvalidations({ type: "TIMER_CHANGED" });

    expect(covers(keys, ["planner", "ws-1", 15])).toBe(true);
    expect(covers(keys, ["time-entry", "running", "ws-1"])).toBe(true);
    expect(covers(keys, ["time-sheet", "ws-1", {}])).toBe(true);
    expect(covers(keys, ["today", "ws-1"])).toBe(true);
    expect(covers(keys, ["my-work", "counts", "ws-1"])).toBe(true);
  });

  it("refreshes every screen that reads the personal plan", () => {
    const keys = userMessageInvalidations({ type: "PLAN_INVALIDATED" });

    for (const screen of ["planner", "schedule", "today"]) {
      expect(covers(keys, [screen, "ws-1"])).toBe(true);
    }
    expect(covers(keys, ["my-work", "counts", "ws-1"])).toBe(true);
    // Mover una tarjeta no cambia que tareas son tuyas.
    expect(covers(keys, ["my-work", "search", {}])).toBe(false);
  });

  it("refreshes what days off and the team lead change for everyone it reaches", () => {
    const keys = userMessageInvalidations({
      type: "AVAILABILITY_INVALIDATED",
      workspaceId: "ws-1",
    });

    for (const screen of [
      "holidays",
      "time-off",
      "planner",
      "schedule",
      "today",
      "lead",
      "my-leads",
      "team-leads",
    ]) {
      expect(covers(keys, [screen, "ws-1"])).toBe(true);
    }
  });

  it("refreshes capacity readers when a block or the workday changes", () => {
    const keys = userMessageInvalidations({ type: "SCHEDULE_INVALIDATED" });

    for (const screen of ["schedule", "planner", "today"]) {
      expect(covers(keys, [screen, "ws-1"])).toBe(true);
    }
  });

  it("scopes workspace views to the workspace in the message", () => {
    expect(
      userMessageInvalidations({ type: "VIEW_UPDATED", workspaceId: "ws-1" }),
    ).toEqual([["workspace-views", "ws-1"]]);
    expect(userMessageInvalidations({ type: "VIEW_UPDATED" })).toEqual([]);
  });

  it("refreshes a workspace's announcements", () => {
    expect(
      userMessageInvalidations({
        type: "ANNOUNCEMENTS_INVALIDATED",
        workspaceId: "ws-1",
      }),
    ).toEqual([["announcements", "ws-1"]]);
    expect(
      userMessageInvalidations({ type: "ANNOUNCEMENTS_INVALIDATED" }),
    ).toEqual([]);
  });

  it("refreshes notifications and ignores unknown messages", () => {
    // Tambien el recordatorio de la tarea abierta: avisar lo borra (ADR 077).
    expect(userMessageInvalidations({ type: "NOTIFICATION_CREATED" })).toEqual([
      ["notifications"],
      ["task-reminder"],
    ]);
    expect(userMessageInvalidations({ type: "SOMETHING_ELSE" })).toEqual([]);
    expect(userMessageInvalidations({})).toEqual([]);
  });

  it("debounces only the bursty membership message", () => {
    expect([...DEBOUNCED_USER_MESSAGES]).toEqual(["MY_WORK_INVALIDATED"]);
  });
});
