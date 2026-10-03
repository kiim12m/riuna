import { describe, expect, it } from "vitest";
import { doneByPerson } from "../../../apps/api/src/lead/team-data";

const monday = new Date(2026, 9, 5);
const tuesday = new Date(2026, 9, 6, 10);
const task = {
  completedAt: tuesday,
  id: "t1",
  number: 1,
  title: "Entregar memoria",
  projectSlug: "OBR",
};

/**
 * Revision de codigo del interludio, hallazgo 5: con dos asignados del
 * equipo y uno que ademas la planifico, «solo la planifico» dependia del
 * orden de las filas del cruce.
 */
describe("doneByPerson", () => {
  // T esta asignada a X y a Z, y X la planifico para el lunes.
  const zFirst = [
    { ...task, assigneeId: "z", plannerId: "x", plannedDate: monday },
    { ...task, assigneeId: "x", plannerId: "x", plannedDate: monday },
  ];

  it("never marks an assignee as only the planner, whatever the row order", () => {
    for (const rows of [zFirst, [...zFirst].reverse()]) {
      const byUser = Object.fromEntries(
        doneByPerson(rows).map((row) => [row.userId, row.viaPlan]),
      );
      expect(byUser).toEqual({ x: false, z: false });
    }
  });

  it("keeps someone who only planned it as only the planner", () => {
    const rows = [
      { ...task, assigneeId: "z", plannerId: "y", plannedDate: monday },
    ];
    expect(
      doneByPerson(rows).map(({ userId, viaPlan }) => ({ userId, viaPlan })),
    ).toEqual([
      { userId: "z", viaPlan: false },
      { userId: "y", viaPlan: true },
    ]);
  });
});
