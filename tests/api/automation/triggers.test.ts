import { describe, expect, it } from "vitest";
import {
  renderTemplate,
  type TaskInfo,
} from "../../../apps/api/src/automation/task-info";
import { matchesTrigger } from "../../../apps/api/src/automation/triggers";

describe("matchesTrigger", () => {
  const move = { fromColumnId: "c1", toColumnId: "c4", toFinal: true };

  it("matches an event only with its own trigger type", () => {
    expect(matchesTrigger({ type: "task.created" }, "task.created", {})).toBe(
      true,
    );
    expect(
      matchesTrigger({ type: "task.created" }, "task.priority_changed", {}),
    ).toBe(false);
  });

  it("a status change checks from, to and final column", () => {
    const status = (config: object) => ({
      type: "task.status_changed" as const,
      ...config,
    });
    expect(matchesTrigger(status({}), "task.status_changed", {}, move)).toBe(
      true,
    );
    expect(
      matchesTrigger(
        status({ toColumnId: "c4" }),
        "task.status_changed",
        {},
        move,
      ),
    ).toBe(true);
    expect(
      matchesTrigger(
        status({ fromColumnId: "c2" }),
        "task.status_changed",
        {},
        move,
      ),
    ).toBe(false);
    expect(
      matchesTrigger(
        status({ toFinal: true }),
        "task.status_changed",
        {},
        {
          ...move,
          toFinal: false,
        },
      ),
    ).toBe(false);
  });

  it("an assignment is someone or a team coming in, never someone leaving", () => {
    const anyone = { type: "task.assigned" as const };
    expect(
      matchesTrigger(anyone, "task.assignees_changed", { addedIds: ["u1"] }),
    ).toBe(true);
    expect(
      matchesTrigger(anyone, "task.assignees_changed", {
        addedIds: [],
        removedIds: ["u1"],
      }),
    ).toBe(false);
    expect(
      matchesTrigger(anyone, "task.team_changed", { newTeamId: "t1" }),
    ).toBe(true);
    expect(
      matchesTrigger({ ...anyone, userId: "u2" }, "task.assignees_changed", {
        addedIds: ["u1"],
      }),
    ).toBe(false);
    expect(
      matchesTrigger({ ...anyone, teamId: "t1" }, "task.team_changed", {
        newTeamId: "t1",
      }),
    ).toBe(true);
  });

  it("a field change can name the field, and a label its name in any case", () => {
    expect(
      matchesTrigger(
        { type: "task.field_changed", fieldKey: "presupuesto" },
        "task.custom_fields_changed",
        { changes: [{ key: "cliente" }, { key: "presupuesto" }] },
      ),
    ).toBe(true);
    expect(
      matchesTrigger(
        { type: "task.field_changed", fieldKey: "presupuesto" },
        "task.custom_fields_changed",
        { changes: [{ key: "cliente" }] },
      ),
    ).toBe(false);
    expect(
      matchesTrigger(
        { type: "task.labeled", labelName: "Urgente" },
        "task.label_assigned",
        { label: { name: " urgente " } },
      ),
    ).toBe(true);
  });
});

describe("renderTemplate", () => {
  const task = {
    title: "Llamar al cliente",
    key: "DEP-23",
    statusName: "En curso",
    projectName: "Departamento",
    taskUrl: "https://riuna.example/t/1",
  } as TaskInfo;

  it("fills every placeholder and leaves the rest of the text alone", () => {
    expect(
      renderTemplate(
        "{tarea} ({titulo}) está {estado} en {proyecto}: {enlace} {otro}",
        task,
      ),
    ).toBe(
      "DEP-23 Llamar al cliente (Llamar al cliente) está En curso en Departamento: https://riuna.example/t/1 {otro}",
    );
  });
});
