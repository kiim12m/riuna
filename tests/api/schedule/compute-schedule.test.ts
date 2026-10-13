import { describe, expect, it } from "vitest";
import {
  computeSchedule,
  ScheduleCycleError,
  type ScheduleTask,
} from "../../../apps/api/src/task/schedule/compute-schedule";
import { WorkCalendar } from "../../../apps/api/src/task/schedule/work-calendar";
import { serverDayKey } from "../../../apps/api/src/utils/day-boundaries";

const calendar = new WorkCalendar(new Set(["2026-10-12"]));
const day = (date: number, month = 10) => new Date(2026, month - 1, date);

function task(id: string, extra: Partial<ScheduleTask> = {}): ScheduleTask {
  return {
    id,
    parentId: null,
    startDate: null,
    dueDate: null,
    autoDates: false,
    isMilestone: false,
    archived: false,
    ...extra,
  };
}

function datesOf(changes: ReturnType<typeof computeSchedule>, id: string) {
  const change = changes.find((entry) => entry.id === id);
  if (!change) return null;
  return {
    start: change.after.startDate ? serverDayKey(change.after.startDate) : null,
    due: change.after.dueDate ? serverDayKey(change.after.dueDate) : null,
    auto: change.after.autoDates,
  };
}

describe("computeSchedule: automatic parent dates (ADR 083)", () => {
  it("takes the whole branch span, grandchildren under a manual child included", () => {
    const tasks = [
      task("fase", { autoDates: true, startDate: day(1), dueDate: day(2) }),
      task("obra", {
        parentId: "fase",
        startDate: day(5),
        dueDate: day(9),
      }),
      task("zanja", { parentId: "obra", startDate: day(6), dueDate: day(16) }),
      task("pintura", {
        parentId: "fase",
        startDate: day(13),
        dueDate: day(14),
      }),
    ];
    const changes = computeSchedule({ tasks, calendar, seeds: ["zanja"] });
    expect(datesOf(changes, "fase")).toEqual({
      start: "2026-10-05",
      due: "2026-10-16",
      auto: true,
    });
    // El padre con fechas propias no se toca: solo queda desbordado.
    expect(datesOf(changes, "obra")).toBeNull();
  });

  it("turns a parent without any dates of its own into an automatic one", () => {
    const tasks = [
      task("padre"),
      task("hija", { parentId: "padre", startDate: day(5), dueDate: day(7) }),
    ];
    const changes = computeSchedule({ tasks, calendar, seeds: ["hija"] });
    expect(datesOf(changes, "padre")).toEqual({
      start: "2026-10-05",
      due: "2026-10-07",
      auto: true,
    });
  });

  it("leaves archived subtasks out of the branch", () => {
    const tasks = [
      task("padre", { autoDates: true, startDate: day(5), dueDate: day(30) }),
      task("viva", { parentId: "padre", startDate: day(5), dueDate: day(7) }),
      task("archivada", {
        parentId: "padre",
        startDate: day(20),
        dueDate: day(30),
        archived: true,
      }),
    ];
    const changes = computeSchedule({ tasks, calendar, seeds: ["archivada"] });
    expect(datesOf(changes, "padre")?.due).toBe("2026-10-07");
  });

  it("does nothing when nothing above the change is automatic", () => {
    const tasks = [
      task("padre", { startDate: day(1), dueDate: day(2) }),
      task("hija", { parentId: "padre", startDate: day(5), dueDate: day(7) }),
    ];
    expect(computeSchedule({ tasks, calendar, seeds: ["hija"] })).toEqual([]);
  });
});

describe("computeSchedule: precedences (ADR 084)", () => {
  const precedes = (predecessorId: string, successorId: string, lag = 0) => ({
    predecessorId,
    successorId,
    lag,
  });

  it("ties a successor to the working day after its predecessor ends, keeping its length", () => {
    const tasks = [
      task("solera", { startDate: day(7), dueDate: day(9) }),
      // Tres dias laborables: lunes 19 a miercoles 21.
      task("cableado", {
        autoDates: true,
        startDate: day(19),
        dueDate: day(21),
      }),
    ];
    const changes = computeSchedule({
      tasks,
      precedences: [precedes("solera", "cableado")],
      calendar,
      seeds: ["solera"],
    });
    // El viernes 9 acaba; el lunes 12 es festivo: empieza el martes 13.
    expect(datesOf(changes, "cableado")).toEqual({
      start: "2026-10-13",
      due: "2026-10-15",
      auto: true,
    });
  });

  it("overlaps with a negative lag and waits with a positive one", () => {
    const tasks = [
      task("a", { startDate: day(5), dueDate: day(9) }),
      task("b", { autoDates: true, startDate: day(1), dueDate: day(1) }),
      task("c", { autoDates: true, startDate: day(1), dueDate: day(1) }),
    ];
    const changes = computeSchedule({
      tasks,
      precedences: [precedes("a", "b", -2), precedes("a", "c", 2)],
      calendar,
      seeds: ["a"],
    });
    expect(datesOf(changes, "b")?.start).toBe("2026-10-08");
    expect(datesOf(changes, "c")?.start).toBe("2026-10-15");
  });

  it("follows the latest of several predecessors, and the chain behind it", () => {
    const tasks = [
      task("p1", { startDate: day(5), dueDate: day(6) }),
      task("p2", { startDate: day(5), dueDate: day(14) }),
      task("s", { autoDates: true, startDate: day(1), dueDate: day(2) }),
      task("t", {
        autoDates: true,
        isMilestone: true,
        startDate: day(1),
        dueDate: day(1),
      }),
    ];
    const changes = computeSchedule({
      tasks,
      precedences: [
        precedes("p1", "s"),
        precedes("p2", "s"),
        precedes("s", "t"),
      ],
      calendar,
      seeds: ["p2"],
    });
    expect(datesOf(changes, "s")).toEqual({
      start: "2026-10-15",
      due: "2026-10-16",
      auto: true,
    });
    // Un hito: un solo dia, el siguiente laborable.
    expect(datesOf(changes, "t")).toEqual({
      start: "2026-10-19",
      due: "2026-10-19",
      auto: true,
    });
  });

  it("pulls a tied successor earlier when its predecessor moves earlier", () => {
    const tasks = [
      task("a", { startDate: day(1), dueDate: day(2) }),
      task("b", { autoDates: true, startDate: day(20), dueDate: day(21) }),
    ];
    const changes = computeSchedule({
      tasks,
      precedences: [precedes("a", "b")],
      calendar,
      seeds: ["a"],
    });
    expect(datesOf(changes, "b")?.start).toBe("2026-10-05");
  });

  it("leaves a successor with its own dates alone", () => {
    const tasks = [
      task("a", { startDate: day(5), dueDate: day(9) }),
      task("b", { startDate: day(1), dueDate: day(2) }),
    ];
    expect(
      computeSchedule({
        tasks,
        precedences: [precedes("a", "b")],
        calendar,
        seeds: ["a"],
      }),
    ).toEqual([]);
  });

  it("uses the end of an automatic parent's branch as a predecessor", () => {
    const tasks = [
      task("fase", { autoDates: true, startDate: day(5), dueDate: day(7) }),
      task("hija", { parentId: "fase", startDate: day(5), dueDate: day(14) }),
      task("despues", { autoDates: true, startDate: day(8), dueDate: day(8) }),
    ];
    const changes = computeSchedule({
      tasks,
      precedences: [precedes("fase", "despues")],
      calendar,
      seeds: ["hija"],
    });
    expect(datesOf(changes, "fase")?.due).toBe("2026-10-14");
    expect(datesOf(changes, "despues")?.start).toBe("2026-10-15");
  });

  it("stops a loop instead of spinning forever", () => {
    const tasks = [
      task("a", { autoDates: true, startDate: day(1), dueDate: day(2) }),
      task("b", { autoDates: true, startDate: day(5), dueDate: day(6) }),
    ];
    expect(() =>
      computeSchedule({
        tasks,
        precedences: [precedes("a", "b"), precedes("b", "a")],
        calendar,
        seeds: ["a"],
      }),
    ).toThrow(ScheduleCycleError);
  });
});
