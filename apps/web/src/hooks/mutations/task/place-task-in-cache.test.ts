import { describe, expect, it } from "vitest";
import type { ProjectWithTasks } from "@/types/project";
import { placeTaskInProject } from "./place-task-in-cache";

const task = (id: string, status: string) => ({ id, status, title: id });

// Solo lo que lee `placeTaskInProject`; el resto del listado no importa aqui.
const project = {
  id: "project-1",
  columns: [
    {
      id: "to-do",
      slug: "to-do",
      tasks: [task("a", "to-do"), task("b", "to-do"), task("c", "to-do")],
    },
    { id: "done", slug: "done", tasks: [task("x", "done")] },
  ],
  plannedTasks: [task("p", "planned")],
  archivedTasks: [],
} as unknown as ProjectWithTasks;

const ids = (tasks: { id: string }[]) => tasks.map((t) => t.id);

describe("placeTaskInProject", () => {
  it("moves a task within its column", () => {
    const next = placeTaskInProject(project, "c", {
      status: "to-do",
      afterId: null,
      beforeId: "a",
    });
    expect(ids(next.columns[0]?.tasks ?? [])).toEqual(["c", "a", "b"]);
    expect(next.columns[1]).toBe(project.columns[1]);
  });

  it("moves a task to another column and gives it that status", () => {
    const next = placeTaskInProject(project, "b", {
      status: "done",
      afterId: "x",
      beforeId: null,
    });
    expect(ids(next.columns[0]?.tasks ?? [])).toEqual(["a", "c"]);
    expect(next.columns[1]?.tasks).toMatchObject([
      { id: "x" },
      { id: "b", status: "done" },
    ]);
  });

  it("moves a task from the backlog to the board", () => {
    const next = placeTaskInProject(project, "p", {
      status: "to-do",
      afterId: "a",
      beforeId: "b",
    });
    expect(next.plannedTasks).toEqual([]);
    expect(ids(next.columns[0]?.tasks ?? [])).toEqual(["a", "p", "b", "c"]);
  });

  it("falls back like the API when the neighbours are gone", () => {
    const next = placeTaskInProject(project, "a", {
      status: "to-do",
      afterId: "gone",
      beforeId: "also-gone",
    });
    expect(ids(next.columns[0]?.tasks ?? [])).toEqual(["b", "c", "a"]);
  });

  it("leaves a listing without the task untouched", () => {
    expect(
      placeTaskInProject(project, "elsewhere", {
        status: "done",
        afterId: null,
        beforeId: null,
      }),
    ).toBe(project);
  });
});
