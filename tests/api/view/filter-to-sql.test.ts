import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  BUILT_IN_FIELDS,
  buildFieldRegistry,
} from "../../../apps/api/src/view/field-registry";
import {
  FilterError,
  type FilterNode,
  filterToSql,
} from "../../../apps/api/src/view/filter-to-sql";

const dialect = new PgDialect();

const registry = buildFieldRegistry([
  { key: "presupuesto", type: "currency" },
  { key: "cliente", type: "text" },
  { key: "urgente", type: "checkbox" },
  { key: "revision", type: "date" },
  { key: "fase", type: "select" },
  { key: "etiquetas", type: "multi_select" },
  { key: "expediente", type: "relation" },
]);

function compile(node: FilterNode) {
  const built = filterToSql(node, registry);
  if (!built) throw new Error("expected a condition");
  const query = dialect.sqlToQuery(built);
  return { sql: query.sql, params: query.params };
}

function condition(
  field: string,
  operator: FilterNode extends { operator: infer O } ? O : never,
  value?: unknown,
): FilterNode {
  return { type: "condition", field, operator, value } as FilterNode;
}

describe("filterToSql", () => {
  it("returns undefined when there is nothing to filter", () => {
    expect(filterToSql(null, registry)).toBeUndefined();
    expect(
      filterToSql({ type: "and", children: [] }, registry),
    ).toBeUndefined();
  });

  // El registro es la lista blanca, y es lo unico que impide que un nombre de
  // campo llegue a la SQL.
  it("refuses a field that is not in the registry", () => {
    expect(() => compile(condition("no_existe", "eq", "x"))).toThrow(
      FilterError,
    );
  });

  it("refuses a field type that cannot be filtered from the JSONB", () => {
    // `relation` no guarda valor en `custom_fields`, asi que el registro no lo
    // incluye aunque su definicion exista.
    expect(() => compile(condition("custom.expediente", "eq", "x"))).toThrow(
      /Unknown field/,
    );
  });

  it("refuses an operator the field's type does not support", () => {
    expect(() => compile(condition("dueDate", "contains", "x"))).toThrow(
      /cannot be used/,
    );
    expect(() => compile(condition("custom.urgente", "gt", true))).toThrow(
      /cannot be used/,
    );
  });

  it("parameterises every value", () => {
    const { sql: text, params } = compile(
      condition("title", "eq", "Reparar carpa"),
    );

    expect(text).toContain("$1");
    expect(text).not.toContain("Reparar carpa");
    expect(params).toEqual(["Reparar carpa"]);
  });

  describe("campos personalizados", () => {
    // El caso que motiva la fase entera.
    it("compares a currency field as a number", () => {
      const { sql: text, params } = compile(
        condition("custom.presupuesto", "gt", 1000),
      );

      expect(text).toContain("jsonb_typeof");
      expect(text).toContain("::numeric");
      expect(params).toEqual(["presupuesto", "presupuesto", 1000]);
    });

    // La guarda que evita que un valor de otro tipo tumbe la consulta entera
    // con un error de conversion.
    it("guards the numeric cast with a type check", () => {
      const { sql: text } = compile(condition("custom.presupuesto", "gte", 0));

      // El tipo se compara contra el literal `'number'`, no contra un
      // parametro: lo elige el descriptor, no quien escribe el filtro.
      expect(text).toContain("jsonb_typeof");
      expect(text).toContain("= 'number'");
      expect(text).toContain("CASE WHEN");
    });

    it("compares a text field without casting", () => {
      const { sql: text } = compile(
        condition("custom.cliente", "contains", "BAUHAUS"),
      );

      expect(text).toContain("ILIKE");
      expect(text).not.toContain("::numeric");
    });

    it("compares a checkbox as a boolean", () => {
      const { sql: text } = compile(condition("custom.urgente", "eq", true));
      expect(text).toContain("::boolean");
    });

    // Las fechas se guardan como `YYYY-MM-DD`, que ordena igual como texto.
    it("compares a date field as text", () => {
      const { sql: text } = compile(
        condition("custom.revision", "lt", "2026-09-01"),
      );
      expect(text).not.toContain("::date");
      expect(text).not.toContain("::timestamp");
    });
  });

  // El fallo que esto arregla: un multi_select guarda un array, y compararlo
  // extrayendo texto nunca casa —un array no es una cadena—, asi que el
  // filtro no devolvia nada en silencio.
  describe("selección múltiple", () => {
    it("pregunta por contencion y no por igualdad", () => {
      const { sql: text, params } = compile(
        condition("custom.etiquetas", "eq", "obra"),
      );

      expect(text).toContain("@>");
      expect(text).not.toContain("jsonb_typeof");
      expect(params[0]).toBe('{"etiquetas":["obra"]}');
    });

    it("convierte in en una alternativa de contenciones", () => {
      const { sql: text, params } = compile(
        condition("custom.etiquetas", "in", ["obra", "carpa"]),
      );

      expect(text.match(/@>/g)).toHaveLength(2);
      expect(text).toContain(" OR ");
      expect(params).toEqual([
        '{"etiquetas":["obra"]}',
        '{"etiquetas":["carpa"]}',
      ]);
    });

    it("niega la contencion para neq y notIn", () => {
      expect(
        compile(condition("custom.etiquetas", "neq", "obra")).sql,
      ).toContain("NOT");
      expect(
        compile(condition("custom.etiquetas", "notIn", ["obra"])).sql,
      ).toContain("NOT");
    });

    // `jsonb_array_length` revienta si el valor no es un array, y eso pasa en
    // cuanto alguien cambie el tipo de un campo con datos dentro.
    it("comprueba que es un array antes de medirlo", () => {
      const { sql: text } = compile(
        condition("custom.etiquetas", "isNotEmpty"),
      );

      expect(text).toContain("jsonb_typeof");
      expect(text).toContain("= 'array'");
      expect(text).toContain("jsonb_array_length");
    });

    it("rechaza los operadores que una lista no puede contestar", () => {
      expect(() =>
        compile(condition("custom.etiquetas", "contains", "obra")),
      ).toThrow(/cannot be used/);
      expect(() =>
        compile(condition("custom.etiquetas", "gt", "obra")),
      ).toThrow(/cannot be used/);
    });
  });

  describe("valores", () => {
    it("rejects a number filter given something that is not a number", () => {
      expect(() =>
        compile(condition("custom.presupuesto", "gt", "mucho")),
      ).toThrow(/finite number/);
      expect(() =>
        compile(condition("custom.presupuesto", "gt", Number.NaN)),
      ).toThrow(FilterError);
    });

    it("rejects an impossible date", () => {
      expect(() => compile(condition("dueDate", "lt", "no es fecha"))).toThrow(
        /not a valid date/,
      );
    });

    it("rejects an empty list", () => {
      expect(() => compile(condition("status", "in", []))).toThrow(
        /non-empty list/,
      );
    });

    // Buscar "50%" no puede convertirse en "empieza por 50".
    it("treats LIKE wildcards in the search text as literals", () => {
      const { params } = compile(condition("title", "contains", "50%_a"));
      expect(params[0]).toBe("%50\\%\\_a%");
    });
  });

  describe("nulos", () => {
    // "prioridad distinta de alta" tiene que incluir las que no tienen
    // prioridad; `<>` a secas las deja fuera y sorprende a todo el mundo.
    it("includes null rows in neq", () => {
      const { sql: text } = compile(condition("priority", "neq", "high"));
      expect(text).toContain("IS NULL OR");
    });

    it("includes null rows in notIn", () => {
      const { sql: text } = compile(condition("status", "notIn", ["done"]));
      expect(text).toContain("IS NULL OR");
    });

    it("does not add the null escape to eq", () => {
      const { sql: text } = compile(condition("priority", "eq", "high"));
      expect(text).not.toContain("IS NULL");
    });
  });

  describe("pertenencia", () => {
    it("turns an epic filter into an EXISTS", () => {
      const { sql: text } = compile(condition("epic", "in", ["epic-1"]));
      expect(text).toContain("EXISTS");
      expect(text).toContain("task_epic");
    });

    // Cada tarea tiene sus propias filas de etiqueta, asi que sus ids no
    // identifican nada entre tareas: lo estable es el nombre.
    it("matches labels by name", () => {
      const { sql: text } = compile(condition("label", "in", ["urgente"]));
      expect(text).toContain('"label"."name"');
    });

    it("negates membership for notIn", () => {
      const { sql: text } = compile(condition("epic", "notIn", ["epic-1"]));
      expect(text).toContain("NOT EXISTS");
    });

    it("asks whether the task has any at all", () => {
      const { sql: text } = compile(condition("epic", "isNotEmpty"));
      expect(text).toContain("EXISTS");
      expect(text).not.toContain("epic_id");
    });

    it("refuses an operator membership cannot answer", () => {
      expect(() => compile(condition("epic", "contains", "x"))).toThrow(
        /cannot be used/,
      );
    });
  });

  describe("árbol", () => {
    it("joins the children of an AND", () => {
      const { sql: text, params } = compile({
        type: "and",
        children: [
          condition("custom.presupuesto", "gt", 1000),
          condition("status", "neq", "done"),
        ],
      });

      expect(text).toContain(" AND ");
      expect(params).toContain(1000);
      expect(params).toContain("done");
    });

    it("joins the children of an OR", () => {
      const { sql: text } = compile({
        type: "or",
        children: [
          condition("priority", "eq", "urgent"),
          condition("priority", "eq", "high"),
        ],
      });

      expect(text).toContain(" OR ");
    });

    it("unwraps a group with a single child", () => {
      const { sql: text } = compile({
        type: "and",
        children: [condition("status", "eq", "done")],
      });

      expect(text).not.toContain(" AND ");
    });

    it("drops empty groups instead of emitting a broken clause", () => {
      const built = filterToSql(
        {
          type: "and",
          children: [
            { type: "or", children: [] },
            condition("status", "eq", "done"),
          ],
        },
        registry,
      );

      const { sql: text } = dialect.sqlToQuery(
        built ??
          (() => {
            throw new Error("expected a condition");
          })(),
      );

      expect(text).not.toContain("()");
    });

    it("negates a subtree", () => {
      const { sql: text } = compile({
        type: "not",
        child: condition("status", "eq", "done"),
      });

      expect(text).toContain("NOT (");
    });

    it("refuses a tree nested past the limit", () => {
      let node: FilterNode = condition("status", "eq", "done");
      for (let i = 0; i < 12; i += 1) {
        node = { type: "and", children: [node] };
      }

      expect(() => compile(node)).toThrow(/nested too deeply/);
    });
  });
});

describe("buildFieldRegistry", () => {
  it("keeps the built-in fields", () => {
    const built = buildFieldRegistry([]);
    expect(Object.keys(built)).toEqual(Object.keys(BUILT_IN_FIELDS));
  });

  // El prefijo es lo que impide que un campo llamado "status" tape al de
  // verdad.
  it("namespaces custom fields so they cannot shadow a built-in one", () => {
    const built = buildFieldRegistry([{ key: "status", type: "text" }]);

    expect(built.status).toEqual(BUILT_IN_FIELDS.status);
    expect(built["custom.status"]).toEqual({
      kind: "json",
      key: "status",
      valueType: "text",
    });
  });

  it("leaves relation fields out, since their value is not in the JSONB", () => {
    const built = buildFieldRegistry([{ key: "cliente", type: "relation" }]);
    expect(built["custom.cliente"]).toBeUndefined();
  });
});
