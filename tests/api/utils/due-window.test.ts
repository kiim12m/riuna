import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  DUE_WINDOWS,
  type DueWindow,
  dueWindowCondition,
  dueWindowExpression,
} from "../../../apps/api/src/utils/due-window";

/**
 * Las dos formas de la ventana de vencimiento tienen que decir lo mismo.
 *
 * `dueWindowExpression` es el `CASE` que **etiqueta** una tarea —lo usan el
 * agrupado de los paneles y el campo `dueWindow` de las vistas personales— y
 * `dueWindowCondition` es el predicado de rango que la **filtra**, que existe
 * aparte solo porque un `CASE` en el `WHERE` no es sargable y dejaria fuera a
 * `task_dueDate_idx`. Nada en el sistema de tipos impide cambiar una sin la
 * otra, y el dia que pasara, "vence esta semana" contaria una cosa en la
 * tarjeta y otra en la pantalla de al lado.
 *
 * Se comparan **compilando las dos** con el dialecto de Drizzle y mirando sus
 * parametros: las fronteras salen de `startOfServerDay` y `addDays` en ambos
 * casos, asi que si una se mueve un dia respecto de la otra, los parametros
 * dejan de coincidir. Que cada fila caiga en su cubo es cosa de las pruebas de
 * integracion; esto es lo que se rompe al editar, y se comprueba sin base.
 */
const dialect = new PgDialect();

// A ISO y no `String(...)`: una frontera se enlaza como `Date`, y su forma por
// defecto es la local ("Mon Sep 21 2026 ..."), que no compara con nada.
const params = (node: Parameters<typeof dialect.sqlToQuery>[0]): string[] =>
  dialect
    .sqlToQuery(node)
    .params.map((value) =>
      value instanceof Date ? value.toISOString() : String(value),
    );

const text = (node: Parameters<typeof dialect.sqlToQuery>[0]): string =>
  dialect.sqlToQuery(node).sql;

const NOW = new Date(2026, 8, 22, 14, 30, 0);
const day = (offset: number) =>
  String(new Date(2026, 8, 22 + offset, 0, 0, 0, 0).toISOString());

describe("dueWindowExpression", () => {
  it("binds today, tomorrow and next week as its three boundaries", () => {
    expect(params(dueWindowExpression(NOW))).toEqual([day(0), day(1), day(7)]);
  });

  it("labels a missing due date rather than letting it fall through", () => {
    expect(text(dueWindowExpression(NOW))).toContain("IS NULL THEN 'none'");
  });
});

describe("dueWindowCondition", () => {
  it("covers every window the CASE can label", () => {
    for (const window of DUE_WINDOWS) {
      expect(() => dueWindowCondition(window, NOW)).not.toThrow();
    }
  });

  it.each([
    ["overdue", [day(0)]],
    ["today", [day(0), day(1)]],
    ["week", [day(1), day(7)]],
    ["later", [day(7)]],
    // Sin fecha no compara contra ninguna frontera: es un `IS NULL`.
    ["none", []],
  ] as Array<[DueWindow, string[]]>)(
    "cuts %s on the same boundaries as the CASE",
    (window, expected) => {
      expect(params(dueWindowCondition(window, NOW))).toEqual(expected);
    },
  );

  it("never invents a boundary the CASE does not know", () => {
    const known = new Set(params(dueWindowExpression(NOW)));

    for (const window of DUE_WINDOWS) {
      for (const boundary of params(dueWindowCondition(window, NOW))) {
        expect(known).toContain(boundary);
      }
    }
  });

  it("compares the bare column, so the due-date index stays usable", () => {
    for (const window of DUE_WINDOWS) {
      const sql = text(dueWindowCondition(window, NOW));
      expect(sql).toContain('"task"."due_date"');
      // Un `CASE` aqui seria exactamente el fallo que este predicado evita.
      expect(sql).not.toContain("CASE");
    }
  });
});
