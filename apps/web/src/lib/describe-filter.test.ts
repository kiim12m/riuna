import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";
import { describeConditions } from "./describe-filter";

const t = ((key: string) =>
  ({
    "tasks:table.operators.eq": "es",
    "tasks:table.operators.in": "es una de",
    "tasks:table.operators.isEmpty": "está vacío",
    "tasks:table.operators.gt": "mayor que",
  })[key] ?? key) as unknown as TFunction;

const fields = [
  {
    key: "priority",
    label: "Prioridad",
    valueType: "id" as const,
    options: [
      { value: "high", label: "Alta" },
      { value: "low", label: "Baja" },
    ],
  },
  {
    key: "custom.presupuesto",
    label: "Presupuesto",
    valueType: "number" as const,
  },
  { key: "dueDate", label: "Vence", valueType: "date" as const },
];

const condition = (field: string, operator: string, value: unknown) =>
  ({ id: field, type: "condition", field, operator, value }) as never;

describe("describeConditions", () => {
  it("names options by their label and joins the conditions", () => {
    expect(
      describeConditions(
        [
          condition("priority", "in", ["high", "low"]),
          condition("custom.presupuesto", "gt", 1000),
          condition("dueDate", "isEmpty", undefined),
        ],
        fields,
        t,
      ),
    ).toBe(
      "Prioridad es una de Alta, Baja · Presupuesto mayor que 1000 · Vence está vacío",
    );
  });

  it("skips a condition still waiting for its value", () => {
    expect(
      describeConditions([condition("priority", "eq", "")], fields, t),
    ).toBe("");
  });
});
