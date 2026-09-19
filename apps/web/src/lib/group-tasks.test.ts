import { describe, expect, it } from "vitest";
import type Task from "@/types/task";
import { groupTasksByTeam, NO_TEAM_GROUP_ID } from "./group-tasks";

function task(overrides: Partial<Task> & { id: string }): Task {
  return {
    title: "Tarea",
    number: 1,
    description: null,
    status: "to-do",
    priority: "medium",
    startDate: null,
    dueDate: null,
    position: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    userId: null,
    assigneeId: null,
    assigneeName: null,
    projectId: "project-1",
    ...overrides,
  };
}

describe("groupTasksByTeam", () => {
  it("puts each task under the team it carries", () => {
    const groups = groupTasksByTeam(
      [
        task({ id: "a", teamId: "team-dev", teamName: "Desarrollo" }),
        task({ id: "b", teamId: "team-design", teamName: "Diseño" }),
        task({ id: "c", teamId: "team-dev", teamName: "Desarrollo" }),
      ],
      "Sin equipo",
    );

    expect(
      groups.map((group) => [group.name, group.tasks.map((t) => t.id)]),
    ).toEqual([
      ["Desarrollo", ["a", "c"]],
      ["Diseño", ["b"]],
    ]);
  });

  it("sorts the teams by name and leaves the ones without a team last", () => {
    const groups = groupTasksByTeam(
      [
        task({ id: "a" }),
        task({ id: "b", teamId: "team-z", teamName: "Zapatería" }),
        task({ id: "c", teamId: "team-a", teamName: "Almacén" }),
      ],
      "Sin equipo",
    );

    expect(groups.map((group) => group.name)).toEqual([
      "Almacén",
      "Zapatería",
      "Sin equipo",
    ]);
    expect(groups.at(-1)?.id).toBe(NO_TEAM_GROUP_ID);
  });

  it("keeps two teams apart even when they share a name", () => {
    const groups = groupTasksByTeam(
      [
        task({ id: "a", teamId: "team-1", teamName: "Soporte" }),
        task({ id: "b", teamId: "team-2", teamName: "Soporte" }),
      ],
      "Sin equipo",
    );

    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.id)).toEqual(["team-1", "team-2"]);
  });

  it("falls back to the team id when the name did not come with the task", () => {
    const groups = groupTasksByTeam(
      [task({ id: "a", teamId: "team-1" })],
      "Sin equipo",
    );

    expect(groups[0].name).toBe("team-1");
  });

  it("returns no groups at all for an empty list", () => {
    expect(groupTasksByTeam([], "Sin equipo")).toEqual([]);
  });
});
