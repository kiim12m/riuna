import * as v from "valibot";
import { describe, expect, it } from "vitest";
import { buildFilter as buildFilterApi } from "../../../apps/api/src/view/build-filter";
import {
  type EditableCondition,
  editableFilterSchema,
  filterNodeSchema,
} from "../../../apps/api/src/view/filter-schema";
// La implementacion del web, importada a proposito: comparar las dos salidas
// es lo unico que impide que diverjan. `apps/web` no depende de `apps/api` en
// tiempo de ejecucion —por eso hay dos—, pero una prueba si puede leer las dos.
import { buildFilter as buildFilterWeb } from "../../../apps/web/src/types/task-filter";

const CASES: Array<{ name: string; conditions: EditableCondition[] }> = [
  { name: "empty list", conditions: [] },
  {
    name: "single condition",
    conditions: [{ id: "a", field: "status", operator: "eq", value: "done" }],
  },
  {
    name: "two conditions",
    conditions: [
      { id: "a", field: "status", operator: "eq", value: "done" },
      { id: "b", field: "priority", operator: "eq", value: "high" },
    ],
  },
  {
    name: "a valueless operator survives without a value",
    conditions: [{ id: "a", field: "dueDate", operator: "isEmpty" }],
  },
  {
    name: "isNotEmpty likewise",
    conditions: [{ id: "a", field: "dueDate", operator: "isNotEmpty" }],
  },
  {
    name: "a condition with an empty field is dropped",
    conditions: [{ id: "a", field: "", operator: "eq", value: "x" }],
  },
  {
    name: "a condition with an empty value is dropped",
    conditions: [{ id: "a", field: "status", operator: "eq", value: "" }],
  },
  {
    name: "a condition with a null value is dropped",
    conditions: [{ id: "a", field: "status", operator: "eq", value: null }],
  },
  {
    name: "a condition with no value at all is dropped",
    conditions: [{ id: "a", field: "status", operator: "eq" }],
  },
  {
    // El caso que decide la forma: dos escritas, una a medio escribir. Si el
    // descarte ocurriera despues de contar, esto saldria como `and` de un hijo.
    name: "dropping leaves a bare node, not an and of one",
    conditions: [
      { id: "a", field: "status", operator: "eq", value: "done" },
      { id: "b", field: "priority", operator: "eq", value: "" },
    ],
  },
  {
    name: "false is a real value and is kept",
    conditions: [{ id: "a", field: "done", operator: "eq", value: false }],
  },
  {
    name: "zero is a real value and is kept",
    conditions: [{ id: "a", field: "estimate", operator: "gte", value: 0 }],
  },
  {
    name: "an array value is kept",
    conditions: [
      { id: "a", field: "priority", operator: "in", value: ["high", "urgent"] },
    ],
  },
  {
    name: "three conditions, one dropped",
    conditions: [
      { id: "a", field: "status", operator: "eq", value: "done" },
      { id: "b", field: "", operator: "eq", value: "x" },
      { id: "c", field: "priority", operator: "neq", value: "low" },
    ],
  },
  {
    name: "every condition dropped",
    conditions: [
      { id: "a", field: "", operator: "eq", value: "x" },
      { id: "b", field: "status", operator: "eq", value: "" },
    ],
  },
];

describe("buildFilter parity between the API and the web", () => {
  for (const { name, conditions } of CASES) {
    it(name, () => {
      expect(buildFilterApi(conditions)).toEqual(buildFilterWeb(conditions));
    });
  }
});

describe("buildFilter shape", () => {
  it("returns null when nothing is usable", () => {
    expect(buildFilterApi([])).toBeNull();
  });

  it("strips the interface id, which the tree validator rejects", () => {
    const built = buildFilterApi([
      { id: "ui-1", field: "status", operator: "eq", value: "done" },
    ]);

    expect(built).toEqual({
      type: "condition",
      field: "status",
      operator: "eq",
      value: "done",
    });
    expect(built).not.toHaveProperty("id");
  });

  it("wraps two or more in an and", () => {
    expect(
      buildFilterApi([
        { id: "a", field: "status", operator: "eq", value: "done" },
        { id: "b", field: "priority", operator: "eq", value: "high" },
      ]),
    ).toEqual({
      type: "and",
      children: [
        { type: "condition", field: "status", operator: "eq", value: "done" },
        { type: "condition", field: "priority", operator: "eq", value: "high" },
      ],
    });
  });
});

describe("a saved view survives the round trip", () => {
  // El fallo que esto guarda: `editableConditionSchema` no declara `type`, asi
  // que Valibot lo descarta al guardar. Mientras `buildFilter` lo propagaba en
  // vez de ponerlo, recargar una vista guardada producia un nodo sin `type` y
  // el motor devolvia un 400 **del listado entero** —exactamente la pantalla en
  // blanco que ese validador se escribio para evitar—.
  it("compiles to a node the engine accepts after being stored", () => {
    const fromTheFilterBar = [
      {
        id: "a",
        type: "condition",
        field: "status",
        operator: "eq",
        value: "done",
      },
      {
        id: "b",
        type: "condition",
        field: "priority",
        operator: "eq",
        value: "high",
      },
    ];

    const stored = v.parse(editableFilterSchema, fromTheFilterBar);
    expect(stored[0]).not.toHaveProperty("type");

    for (const build of [buildFilterApi, buildFilterWeb]) {
      const node = build(stored as EditableCondition[]);
      expect(v.safeParse(filterNodeSchema, node).success).toBe(true);
    }
  });

  it("also survives when a single condition was stored", () => {
    const stored = v.parse(editableFilterSchema, [
      {
        id: "a",
        type: "condition",
        field: "status",
        operator: "eq",
        value: "done",
      },
    ]);

    for (const build of [buildFilterApi, buildFilterWeb]) {
      expect(
        v.safeParse(filterNodeSchema, build(stored as EditableCondition[]))
          .success,
      ).toBe(true);
    }
  });
});
