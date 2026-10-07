import { describe, expect, it } from "vitest";
import {
  identityKeys,
  parseComments,
  parseServitecRows,
  ServitecFormatError,
} from "../../../apps/api/src/task/exports/servitec-parse";
import { statusForEstado } from "../../../apps/api/src/task/exports/servitec-plan";

const day = (y: number, m: number, d: number) =>
  new Date(Date.UTC(y, m - 1, d));

describe("parseServitecRows", () => {
  // Como el cuadro hecho a mano: una fila de mas arriba, la leyenda debajo de
  // las cabeceras y relevos con «-» al final.
  const table = [
    [null, "TAREAS"],
    [null, null, "Nota suelta"],
    [
      "Fecha",
      "FECHA",
      "CONCEPTO",
      "PROYECTO",
      "Estado",
      "Comentario",
      null,
      null,
      null,
      "ID",
    ],
    [
      day(2026, 1, 1),
      null,
      "Breve explicación. Ej: Croquis",
      "Empresa + ubicación",
      "Pendiente",
      "Respuesta",
    ],
    [
      day(2026, 5, 29),
      day(2026, 6, 3),
      "Revisar tierra",
      "BAUHAUS TORREVIEJA",
      ".Realizado",
      "03/06/2026 — Pedir medidas\nurgente\n05/06/2026 — Recibido",
      null,
      null,
      null,
      "task-1",
    ],
    [
      day(2026, 8, 17),
      null,
      "Enviar fotos",
      "IES Sant Boi",
      "en curso",
      "Llamar antes",
      null,
      null,
      null,
      null,
    ],
    [null, null, null, null, "-"],
  ];

  it("finds the header row, skips the legend and the spare rows", () => {
    const rows = parseServitecRows(table);
    expect(rows.map((row) => [row.row, row.concepto])).toEqual([
      [5, "Revisar tierra"],
      [6, "Enviar fotos"],
    ]);
  });

  it("reads the first «Fecha» as the creation day, the id and the state", () => {
    const [first, second] = parseServitecRows(table);
    expect(first).toMatchObject({
      id: "task-1",
      fecha: day(2026, 5, 29),
      proyecto: "BAUHAUS TORREVIEJA",
      estado: ".Realizado",
    });
    expect(second).toMatchObject({ id: null, estado: "En curso" });
  });

  it("splits the comments by their dates, and an undated one takes the row's", () => {
    const [first, second] = parseServitecRows(table);
    expect(first?.comentarios).toEqual([
      { fecha: day(2026, 6, 3), texto: "Pedir medidas\nurgente" },
      { fecha: day(2026, 6, 5), texto: "Recibido" },
    ]);
    expect(second?.comentarios).toEqual([
      { fecha: day(2026, 8, 17), texto: "Llamar antes" },
    ]);
  });

  it("refuses a sheet without CONCEPTO and PROYECTO", () => {
    expect(() => parseServitecRows([["Título", "Estado"]])).toThrow(
      ServitecFormatError,
    );
  });
});

describe("parseComments", () => {
  it("accepts a hyphen or a colon after the date, as written by hand", () => {
    expect(parseComments("01/02/2026 - Uno\n2/2/2026: Dos", null)).toEqual([
      { fecha: day(2026, 2, 1), texto: "Uno" },
      { fecha: day(2026, 2, 2), texto: "Dos" },
    ]);
  });
});

describe("identityKeys", () => {
  it("tells two identical rows apart by their order", () => {
    const row = {
      row: 1,
      id: null,
      fecha: day(2026, 3, 1),
      concepto: "Medir",
      proyecto: "Obras",
      estado: "Pendiente" as const,
      comentarios: [],
    };
    expect(identityKeys([row, { ...row, row: 2 }])).toEqual([
      "obras|medir|2026-03-01",
      "obras|medir|2026-03-01#2",
    ]);
  });
});

describe("statusForEstado", () => {
  const columns = [
    { slug: "to-do", position: 0, isFinal: false },
    { slug: "in-progress", position: 1, isFinal: false },
    { slug: "in-review", position: 2, isFinal: false },
    { slug: "done", position: 3, isFinal: true },
  ];

  it("maps each state to its column, and «.Realizado» to archived", () => {
    expect(statusForEstado("Pendiente", columns, null)).toBe("to-do");
    expect(statusForEstado("En curso", columns, null)).toBe("in-progress");
    expect(statusForEstado("Realizado", columns, null)).toBe("done");
    expect(statusForEstado(".Realizado", columns, null)).toBe("archived");
  });

  // «En curso» es tanto «En curso» como «En revisión»: volver a subir la hoja
  // no puede devolver una tarea de la segunda a la primera.
  it("leaves a task where it is when the sheet would write the same state", () => {
    expect(statusForEstado("En curso", columns, "in-review")).toBe("in-review");
    expect(statusForEstado("Realizado", columns, "in-review")).toBe("done");
  });
});
