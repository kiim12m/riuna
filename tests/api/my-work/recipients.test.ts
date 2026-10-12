import { beforeEach, describe, expect, it, vi } from "vitest";

const mockWhere = vi.fn();
const mockSelectDistinct = vi.fn(() => ({
  from: () => ({ where: (...args: unknown[]) => mockWhere(...args) }),
}));

vi.mock("../../../apps/api/src/database", () => ({
  default: {
    selectDistinct: (...args: unknown[]) => mockSelectDistinct(...args),
  },
}));

import {
  MY_WORK_EVENTS,
  recipientsForMyWork,
} from "../../../apps/api/src/my-work/recipients";

describe("recipientsForMyWork", () => {
  beforeEach(() => {
    mockSelectDistinct.mockClear();
    mockWhere.mockReset();
    mockWhere.mockResolvedValue([]);
  });

  // Lo que hace barata la suscripcion: los eventos ya viajan con los ids a los
  // dos lados del cambio, asi que la familia de asignados no consulta nada. Si
  // algun dia deja de ser cierto, este `not.toHaveBeenCalled` lo cazara antes
  // de que aparezca una consulta en el camino de mutacion mas caliente.
  it("resolves the assignee family without touching the database", async () => {
    const cases: Array<[string, Record<string, unknown>, string[]]> = [
      [
        "task.assignees_changed",
        { addedIds: ["ana", "luis"], removedIds: ["marta"] },
        ["ana", "luis", "marta"],
      ],
      [
        "task.assignee_changed",
        { oldAssignee: "ana", newAssigneeId: "luis" },
        ["ana", "luis"],
      ],
      ["task.unassigned", { previousAssigneeId: "ana" }, ["ana"]],
      ["task.status_changed", { assigneeId: "ana" }, ["ana"]],
      // Quien entra o sale de lo que observa (ADR 076).
      [
        "task.watchers_changed",
        { addedIds: ["ana"], removedIds: ["luis"] },
        ["ana", "luis"],
      ],
    ];

    for (const [eventName, data, expected] of cases) {
      expect(await recipientsForMyWork(eventName, data)).toEqual(expected);
    }

    expect(mockSelectDistinct).not.toHaveBeenCalled();
  });

  it("dedupes a user who appears on both sides of the change", async () => {
    const recipients = await recipientsForMyWork("task.assignees_changed", {
      addedIds: ["ana", "luis"],
      removedIds: ["ana"],
    });

    expect(recipients).toEqual(["ana", "luis"]);
  });

  it("ignores missing, empty and malformed ids", async () => {
    expect(
      await recipientsForMyWork("task.assignees_changed", {
        addedIds: ["ana", "", null, 42],
        removedIds: "no soy una lista",
      }),
    ).toEqual(["ana"]);

    expect(await recipientsForMyWork("task.unassigned", {})).toEqual([]);
    // `bulk-update-tasks` y `cascade-status` publican sin `assigneeId`: nadie
    // recibe nada y la pagina se entera en el siguiente sondeo.
    expect(await recipientsForMyWork("task.status_changed", {})).toEqual([]);
  });

  it("asks for the members of both teams when a task changes hands", async () => {
    mockWhere.mockResolvedValue([{ userId: "ana" }, { userId: "luis" }]);

    const recipients = await recipientsForMyWork("task.team_changed", {
      oldTeamId: "team-a",
      newTeamId: "team-b",
    });

    expect(recipients).toEqual(["ana", "luis"]);
    expect(mockSelectDistinct).toHaveBeenCalledTimes(1);
  });

  it("warns the old team when the task stops being theirs", async () => {
    mockWhere.mockResolvedValue([{ userId: "ana" }]);

    expect(
      await recipientsForMyWork("task.team_unassigned", {
        oldTeamId: "team-a",
      }),
    ).toEqual(["ana"]);
  });

  // Sin `oldTeamId` no hay a quien avisar, y sobre todo no se puede llamar a
  // `inArray` con una lista vacia.
  it("does not query when the team payload is empty", async () => {
    expect(await recipientsForMyWork("task.team_unassigned", {})).toEqual([]);
    expect(await recipientsForMyWork("task.team_changed", {})).toEqual([]);
    expect(mockSelectDistinct).not.toHaveBeenCalled();
  });

  it("warns assignees and team members when the task is deleted", async () => {
    mockWhere.mockResolvedValue([{ userId: "marta" }]);

    const recipients = await recipientsForMyWork("task.deleted", {
      assigneeIds: ["ana"],
      teamId: "team-a",
    });

    expect(recipients).toEqual(["ana", "marta"]);
  });

  it("stays silent for an event it does not watch", async () => {
    expect(
      await recipientsForMyWork("task.updated", { assigneeId: "ana" }),
    ).toEqual([]);
    expect(MY_WORK_EVENTS).not.toContain("task.updated");
  });
});
