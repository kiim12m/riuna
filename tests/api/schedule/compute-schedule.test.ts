import { describe, expect, it } from "vitest";
import {
  computeSchedule,
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
