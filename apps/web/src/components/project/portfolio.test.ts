import { describe, expect, it } from "vitest";
import {
  nextSort,
  type PortfolioProject,
  portfolioTree,
  sortProjects,
} from "./portfolio";

const project = (
  id: string,
  extra: Partial<PortfolioProject> = {},
): PortfolioProject => ({
  id,
  name: id,
  statistics: { completionPercentage: 0, totalTasks: 0 },
  ...extra,
});

describe("sortProjects", () => {
  const lead = (userId: string) => ({ u1: "Ana", u2: "Luis" })[userId] ?? "";

  it("sorts by health in its own order, not alphabetically", () => {
    const sorted = sortProjects(
      [
        project("a", { health: "off_track" }),
        project("b", { health: "on_track" }),
        project("c", { health: "at_risk" }),
      ],
      "health",
      lead,
    );
    expect(sorted.map((entry) => entry.id)).toEqual(["b", "c", "a"]);
  });

  it("leaves what is empty at the end in both directions", () => {
    const projects = [
      project("sin", {}),
      project("pronto", { endDate: "2026-10-01T00:00:00.000Z" }),
      project("tarde", { endDate: "2026-12-01T00:00:00.000Z" }),
    ];
    expect(sortProjects(projects, "endDate", lead).map((p) => p.id)).toEqual([
      "pronto",
      "tarde",
      "sin",
    ]);
    expect(sortProjects(projects, "-endDate", lead).map((p) => p.id)).toEqual([
      "tarde",
      "pronto",
      "sin",
    ]);
  });

  it("sorts by a project field and by the lead's name", () => {
    const projects = [
      project("a", { customFields: { presupuesto: 500 }, leadUserId: "u2" }),
      project("b", { customFields: { presupuesto: 90 }, leadUserId: "u1" }),
    ];
    expect(
      sortProjects(projects, "-custom.presupuesto", lead).map((p) => p.id),
    ).toEqual(["a", "b"]);
    expect(sortProjects(projects, "lead", lead).map((p) => p.id)).toEqual([
      "b",
      "a",
    ]);
  });
});

describe("nextSort", () => {
  it("goes up, down and back to the manual order", () => {
    expect(nextSort(undefined, "endDate")).toBe("endDate");
    expect(nextSort("endDate", "endDate")).toBe("-endDate");
    expect(nextSort("-endDate", "endDate")).toBeUndefined();
    expect(nextSort("-endDate", "progress")).toBe("progress");
  });
});

describe("portfolioTree", () => {
  const rows = [
    project("alcala", { parentId: "henares" }),
    project("henares"),
    project("prl"),
    project("mnt", { parentId: "henares" }),
    project("ceip", { parentId: "coslada" }),
  ];

  it("hangs each subproject under its parent, in the order it came", () => {
    expect(
      portfolioTree(rows, new Set()).map(
        (row) => `${row.depth}:${row.project.id}:${row.childCount}`,
      ),
    ).toEqual(["0:henares:2", "1:alcala:0", "1:mnt:0", "0:prl:0", "0:ceip:0"]);
  });

  it("hides a collapsed parent's children, and keeps an orphan as a root", () => {
    expect(
      portfolioTree(rows, new Set(["henares"])).map((row) => row.project.id),
    ).toEqual(["henares", "prl", "ceip"]);
  });
});
