import { describe, expect, it } from "vitest";
import { buildTaskViewFilter } from "./task-view-filter";

// Miercoles 7 de octubre de 2026.
const NOW = new Date(2026, 9, 7, 12, 0, 0);
const base = { weekStartsOn: 1 as const, now: NOW };

const cond = (field: string, operator: string, value?: unknown) => ({
  type: "condition",
  field,
  operator,
  ...(value !== undefined ? { value } : {}),
});

describe("buildTaskViewFilter", () => {
  it("asks for the whole project when nothing is filtered", () => {
    expect(buildTaskViewFilter({}, base)).toBeNull();
    expect(
      buildTaskViewFilter({ status: [], priority: null }, base),
    ).toBeNull();
  });

  it("joins the menus with and, each one as a set of values", () => {
    expect(
      buildTaskViewFilter(
        {
          status: ["to-do"],
          priority: ["high", "urgent"],
          assignee: ["u1"],
          team: ["t1"],
          epics: ["e1"],
        },
        base,
      ),
    ).toEqual({
      type: "and",
      children: [
        cond("status", "in", ["to-do"]),
        cond("priority", "in", ["high", "urgent"]),
        cond("assignee", "in", ["u1"]),
        cond("team", "in", ["t1"]),
        cond("epic", "in", ["e1"]),
      ],
    });
  });

  it("matches labels by name, so copies of one label on different tasks all count", () => {
    const labelNames = new Map([
      ["l1", "Obra"],
      ["l2", "Obra"],
      ["l3", "Urgente"],
    ]);

    expect(
      buildTaskViewFilter(
        { labels: ["l1", "l2", "l3"] },
        { ...base, labelNames },
      ),
    ).toEqual(cond("label", "in", ["Obra", "Urgente"]));
  });

  it("asks for nothing, not for everything, when the chosen labels no longer exist", () => {
    const filter = buildTaskViewFilter(
      { labels: ["borrada"] },
      { ...base, labelNames: new Map() },
    );

    expect(filter).toEqual(cond("label", "in", ["\u0000"]));
  });

  describe("due date", () => {
    it("this week is the whole week as days, from the person's first day", () => {
      expect(buildTaskViewFilter({ dueDate: ["dueThisWeek"] }, base)).toEqual({
        type: "and",
        children: [
          cond("dueDate", "gte", "2026-10-05"),
          cond("dueDate", "lte", "2026-10-11"),
        ],
      });
    });

    it("moves with the week start of the person", () => {
      const sunday = buildTaskViewFilter(
        { dueDate: ["dueThisWeek"] },
        { ...base, weekStartsOn: 0 },
      );

      expect(sunday).toEqual({
        type: "and",
        children: [
          cond("dueDate", "gte", "2026-10-04"),
          cond("dueDate", "lte", "2026-10-10"),
        ],
      });
    });

    it("next week is the following one, and no date is an empty date", () => {
      expect(buildTaskViewFilter({ dueDate: ["dueNextWeek"] }, base)).toEqual({
        type: "and",
        children: [
          cond("dueDate", "gte", "2026-10-12"),
          cond("dueDate", "lte", "2026-10-18"),
        ],
      });
      expect(buildTaskViewFilter({ dueDate: ["noDueDate"] }, base)).toEqual(
        cond("dueDate", "isEmpty"),
      );
    });

    it("several options are alternatives, not a conjunction", () => {
      const filter = buildTaskViewFilter(
        { dueDate: ["dueThisWeek", "noDueDate"] },
        base,
      );

      expect(filter).toMatchObject({ type: "or" });
      expect((filter as { children: unknown[] }).children).toHaveLength(2);
    });
  });

  describe("text", () => {
    it("looks in the title and the description", () => {
      expect(buildTaskViewFilter({}, { ...base, text: "  zanja " })).toEqual({
        type: "or",
        children: [
          cond("title", "contains", "zanja"),
          cond("description", "contains", "zanja"),
        ],
      });
    });

    it("also matches the number when the text is one, with or without #", () => {
      for (const text of ["23", "#23"]) {
        const filter = buildTaskViewFilter({}, { ...base, text }) as {
          children: unknown[];
        };
        expect(filter.children).toContainEqual(cond("number", "eq", 23));
      }
    });

    it("recognises the identifier of this project, in any case, and no other", () => {
      const own = buildTaskViewFilter(
        {},
        { ...base, text: "dep-12", projectSlug: "DEP" },
      ) as { children: unknown[] };
      const foreign = buildTaskViewFilter(
        {},
        { ...base, text: "OTRO-12", projectSlug: "DEP" },
      ) as { children: unknown[] };

      expect(own.children).toContainEqual(cond("number", "eq", 12));
      expect(foreign.children).not.toContainEqual(cond("number", "eq", 12));
    });

    it("combines with the menus", () => {
      expect(
        buildTaskViewFilter({ status: ["to-do"] }, { ...base, text: "x" }),
      ).toMatchObject({ type: "and" });
    });
  });
});
