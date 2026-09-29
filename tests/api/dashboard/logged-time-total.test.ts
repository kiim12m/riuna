import { and, eq, isNotNull, sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import db from "../../../apps/api/src/database";
import {
  projectTable,
  taskTable,
  timeEntryTable,
} from "../../../apps/api/src/database/schema";

/**
 * El total de horas sin repartir compila a SQL valido.
 *
 * `aggregateLoggedTime` reparte por persona, proyecto o fecha, y desde la
 * ADR 043 tambien sabe **no repartir**: una sola cifra para la tarjeta de horas
 * de la fila de arriba. Esa rama no pasa por `GROUP BY` ni por `ORDER BY`, y un
 * `.orderBy()` sin argumentos emitiendo un `ORDER BY` huerfano seria SQL rota
 * que solo se veria contra una base de datos de verdad. Aqui se compila con el
 * dialecto, sin conectar con nada.
 */
describe("logged time without a grouping", () => {
  const dialect = new PgDialect();

  const query = (withOrder: boolean) =>
    db
      .select({
        key: sql<null>`NULL`,
        value: sql<number>`COALESCE(SUM(${timeEntryTable.duration}), 0)::bigint`,
        total: sql<number>`COUNT(*)::int`,
      })
      .from(timeEntryTable)
      .innerJoin(taskTable, eq(taskTable.id, timeEntryTable.taskId))
      .innerJoin(projectTable, eq(projectTable.id, taskTable.projectId))
      .where(and(isNotNull(timeEntryTable.endTime)))
      .groupBy(...[])
      .orderBy(...(withOrder ? [sql`1`] : []))
      .limit(1);

  it("emits neither an empty GROUP BY nor an empty ORDER BY", () => {
    const { sql: text } = dialect.sqlToQuery(query(false).getSQL());

    expect(text).not.toMatch(/group by\s*(order|limit|$)/i);
    expect(text).not.toMatch(/order by\s*(limit|$)/i);
    expect(text).toMatch(/SUM\("time_entry"\."duration"\)/);
  });

  it("still emits ORDER BY when a grouping asks for one", () => {
    const { sql: text } = dialect.sqlToQuery(query(true).getSQL());
    expect(text).toMatch(/order by/i);
  });
});
