import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  BUILT_IN_FIELDS,
  buildWorkspaceFieldRegistry,
} from "../../../apps/api/src/view/field-registry";
import {
  FilterError,
  type FilterNode,
  filterToSql,
} from "../../../apps/api/src/view/filter-to-sql";

const dialect = new PgDialect();

function compile(node: FilterNode, registry = buildWorkspaceFieldRegistry([])) {
  const built = filterToSql(node, registry);
  if (!built) throw new Error("expected a condition");
  return dialect.sqlToQuery(built);
}

describe("buildWorkspaceFieldRegistry", () => {
  it("drops the six fields whose meaning is per project", () => {
    const registry = buildWorkspaceFieldRegistry([]);

    for (const field of [
      "status",
      "column",
      "number",
      "position",
      "parent",
      "depth",
    ]) {
      expect(registry[field]).toBeUndefined();
      // Y el motor lo rechaza en vez de dejarlo llegar a la SQL: el registro
      // es la lista blanca.
      expect(() =>
        compile(
          { type: "condition", field, operator: "eq", value: "x" },
          registry,
        ),
      ).toThrow(FilterError);
    }
  });

  it("keeps the memberships, which match by id or by name", () => {
    const registry = buildWorkspaceFieldRegistry([]);

    for (const field of ["epic", "label", "assignees"]) {
      expect(registry[field]).toBeDefined();
    }
  });

  it("keeps every other built-in field", () => {
    const registry = buildWorkspaceFieldRegistry([]);
    const dropped = new Set([
      "status",
      "column",
      "number",
      "position",
      "parent",
      "depth",
    ]);

    for (const field of Object.keys(BUILT_IN_FIELDS)) {
      if (dropped.has(field)) continue;
      expect(registry[field]).toBeDefined();
    }
  });

  it("offers only workspace custom fields", () => {
    const registry = buildWorkspaceFieldRegistry([
      { key: "presupuesto", type: "currency" },
      { key: "cliente", type: "text" },
    ]);

    expect(registry["custom.presupuesto"]).toEqual({
      kind: "json",
      key: "presupuesto",
      valueType: "number",
    });
    expect(registry["custom.cliente"]).toBeDefined();
  });

  it("drops a workspace key that a project redefines with another shape", () => {
    // Es el caso peligroso: sin retirarlo, `custom.presupuesto` se compila como
    // numero y en el proyecto que lo declara texto `jsonb_typeof` no casa, asi
    // que esas tareas desaparecen del recuento **sin ningun error**.
    const registry = buildWorkspaceFieldRegistry(
      [{ key: "presupuesto", type: "currency" }],
      new Set(["presupuesto"]),
    );

    expect(registry["custom.presupuesto"]).toBeUndefined();
  });

  it("skips field types that store no value in the JSONB", () => {
    const registry = buildWorkspaceFieldRegistry([
      { key: "expediente", type: "relation" },
    ]);

    expect(registry["custom.expediente"]).toBeUndefined();
  });
});

describe("done and completedAt", () => {
  it("compiles `done` to a null check on completed_at", () => {
    const { sql, params } = compile({
      type: "condition",
      field: "done",
      operator: "eq",
      value: true,
    });

    expect(sql).toContain('"task"."completed_at" IS NOT NULL');
    expect(params).toEqual([true]);
  });

  it("compiles `completedAt` as a date column", () => {
    const value = new Date("2026-01-01T00:00:00.000Z");
    const { sql, params } = compile({
      type: "condition",
      field: "completedAt",
      operator: "gte",
      value: value.toISOString(),
    });

    expect(sql).toContain('"task"."completed_at" >=');
    expect(params).toEqual([value]);
  });

  it("offers `project` so a cross-project filter can narrow to one", () => {
    const { sql, params } = compile({
      type: "condition",
      field: "project",
      operator: "eq",
      value: "project-1",
    });

    expect(sql).toContain('"task"."project_id" =');
    expect(params).toEqual(["project-1"]);
  });
});
