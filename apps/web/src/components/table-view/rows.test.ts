import { describe, expect, it } from "vitest";
import { buildRows, groupByEpic, rowIdOf } from "./rows";

const task = (
  id: string,
  extra: Record<string, unknown> = {},
): Parameters<typeof buildRows>[0][number] =>
  ({
    id,
    title: id,
    parentId: null,
    position: 0,
    epics: [],
    ...extra,
  }) as never;

const fase1 = { id: "e1", name: "Fase 1", color: null };
const fase2 = { id: "e2", name: "Fase 2", color: "#16a34a" };

describe("groupByEpic", () => {
  it("puts a task under each of its epics and the rest in a last group", () => {
    const rows = buildRows([
      task("a", { epics: [fase1] }),
      task("b", { epics: [fase1, fase2] }),
      task("c"),
    ]);

    const groups = groupByEpic(rows);

    expect(groups.map((group) => group.key)).toEqual([
      "epic:e1",
      "epic:e2",
      "none",
    ]);
    expect(groups[0]?.rows.map((row) => row.id)).toEqual(["a", "b"]);
    expect(groups[1]?.rows.map((row) => row.id)).toEqual(["b"]);
    expect(groups[2]?.rows.map((row) => row.id)).toEqual(["c"]);
  });

  it("gives every copy of a task its own row id, so folding and editing stay apart", () => {
    const groups = groupByEpic(
      buildRows([task("b", { epics: [fase1, fase2] })]),
    );

    const ids = groups.flatMap((group) => group.rows.map(rowIdOf));

    expect(ids).toEqual(["b@epic:e1", "b@epic:e2"]);
    expect(new Set(ids).size).toBe(2);
  });

  it("keeps a branch together: the children follow their parent whatever their own epics", () => {
    const rows = buildRows([
      task("padre", { epics: [fase1] }),
      task("hija", { parentId: "padre", epics: [fase2] }),
    ]);

    const groups = groupByEpic(rows);

    expect(groups.map((group) => group.key)).toEqual(["epic:e1"]);
    const [padre] = groups[0]?.rows ?? [];
    expect(padre?.subRows.map((row) => row.id)).toEqual(["hija"]);
    expect(padre?.subRows.map(rowIdOf)).toEqual(["hija@epic:e1"]);
  });

  it("orders the groups by epic name, not by where they were first found", () => {
    const groups = groupByEpic(
      buildRows([task("a", { epics: [fase2] }), task("b", { epics: [fase1] })]),
    );

    expect(groups.map((group) => group.epic?.name)).toEqual([
      "Fase 1",
      "Fase 2",
    ]);
  });

  it("has no groups for no tasks", () => {
    expect(groupByEpic([])).toEqual([]);
  });
});
