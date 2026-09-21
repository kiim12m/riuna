import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  buildOrderBy,
  SEARCH_SORT_FIELDS,
} from "../../../apps/api/src/my-work/controllers/search-tasks";

const dialect = new PgDialect();

function compile(
  sortBy: (typeof SEARCH_SORT_FIELDS)[number],
  order: "asc" | "desc",
) {
  return buildOrderBy(sortBy, order).map(
    (piece) => dialect.sqlToQuery(piece).sql,
  );
}

/**
 * El desempate por `id` es lo que hace correcta la paginacion.
 *
 * Con `OFFSET`, Postgres no promete nada sobre como reparte los empates entre
 * una consulta y la siguiente, asi que sin un orden total dos paginas
 * consecutivas pueden repetir una fila o saltarsela. Ordenar por prioridad
 * —cinco valores en todo el espacio— deja miles de empates: aqui el caso raro
 * es el habitual.
 */
describe("buildOrderBy", () => {
  for (const sortBy of SEARCH_SORT_FIELDS) {
    for (const sortOrder of ["asc", "desc"] as const) {
      it(`closes the ${sortBy}/${sortOrder} order with a total one`, () => {
        const pieces = compile(sortBy, sortOrder);

        expect(pieces.length).toBeGreaterThanOrEqual(2);
        expect(pieces.at(-1)).toContain('"id"');
      });
    }
  }

  it("defaults to due date first, then priority", () => {
    const pieces = compile("smart", "asc");

    expect(pieces).toHaveLength(3);
    expect(pieces[0]).toContain("due_date");
    expect(pieces[1]).toContain("CASE");
  });

  // Nulos al final en las dos direcciones: una tarea sin fecha no es la mas
  // urgente de la lista cuando se ordena al reves.
  it("keeps undated tasks last in both directions", () => {
    for (const direction of ["asc", "desc"] as const) {
      expect(compile("dueDate", direction)[0]).toContain("NULLS LAST");
      expect(compile("startDate", direction)[0]).toContain("NULLS LAST");
    }
  });

  it("sorts by project name, which is what a cross-project list can group by", () => {
    expect(compile("project", "asc")[0]).toContain("name");
  });
});
