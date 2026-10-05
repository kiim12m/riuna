import ExcelJS from "exceljs";
import { beforeAll, describe, expect, it } from "vitest";
import { resolveEstado } from "../../../apps/api/src/task/controllers/export-workspace-tasks";
import {
  buildServitecWorkbook,
  type ServitecRow,
} from "../../../apps/api/src/task/exports/servitec-workbook";

// La conversion de fechas que esta hoja descubrio vive ahora en el motor de
// intercambio y se prueba en `exchange/sheet-dates.test.ts` (ADR 017). Aqui
// queda lo que es de la plantilla: el mapeo de estado y la forma del `.xlsx`.

describe("resolveEstado", () => {
  const firstColumn = { isFinal: false, position: 0 };
  const middleColumn = { isFinal: false, position: 1 };
  const finalColumn = { isFinal: true, position: 3 };

  it("reports an archived task as done-and-filed, whatever column it sat in", () => {
    expect(resolveEstado("archived", finalColumn)).toBe(".Realizado");
    expect(resolveEstado("archived", firstColumn)).toBe(".Realizado");
    expect(resolveEstado("archived", undefined)).toBe(".Realizado");
  });

  it("reports a final column as done", () => {
    expect(resolveEstado("done", finalColumn)).toBe("Realizado");
  });

  it("reports the first column as pending", () => {
    expect(resolveEstado("to-do", firstColumn)).toBe("Pendiente");
  });

  it("reports any other column as in progress", () => {
    expect(resolveEstado("in-progress", middleColumn)).toBe("En curso");
    expect(resolveEstado("in-review", { isFinal: false, position: 2 })).toBe(
      "En curso",
    );
  });

  it("reports a backlog task as pending", () => {
    expect(resolveEstado("planned", undefined)).toBe("Pendiente");
  });

  it("falls back to pending when the column has gone missing", () => {
    expect(resolveEstado("some-deleted-column", undefined)).toBe("Pendiente");
  });

  // A project can rename or reorder its columns; the mapping must not depend on
  // what they are called.
  it("ignores column names entirely", () => {
    expect(resolveEstado("por-hacer", { isFinal: false, position: 0 })).toBe(
      "Pendiente",
    );
    expect(resolveEstado("entregado", { isFinal: true, position: 7 })).toBe(
      "Realizado",
    );
  });
});

describe("buildServitecWorkbook", () => {
  const rows: ServitecRow[] = [
    {
      fecha: new Date("2026-05-29T08:00:00Z"),
      fechaActualizacion: new Date("2026-06-03T10:00:00Z"),
      concepto: "Revisar Puesta a Tierra Torrevieja",
      proyecto: "BAUHAUS TORREVIEJA",
      estado: ".Realizado",
      comentarios: [
        {
          fecha: new Date("2026-06-03T09:00:00Z"),
          // Un parrafo vacio en el editor deja una linea en blanco: en la hoja
          // no tiene que verse.
          texto: "Demanar medicions\n\nUrgent",
        },
        { fecha: new Date("2026-06-05T09:00:00Z"), texto: "Rebut" },
      ],
    },
    {
      fecha: new Date("2026-08-17T22:30:00Z"),
      fechaActualizacion: new Date("2026-08-17T22:30:00Z"),
      concepto: "Enviar fotografies CGP",
      proyecto: "IES SANT BOI",
      estado: "Pendiente",
      comentarios: [],
    },
  ];

  let sheet: ExcelJS.Worksheet;

  beforeAll(async () => {
    const buffer = await buildServitecWorkbook(rows);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const loaded = workbook.getWorksheet("Full1");
    if (!loaded) throw new Error("the sheet is not named Full1");
    sheet = loaded;
  });

  it("keeps the title and the header row where the original has them", () => {
    expect(sheet.getCell("B1").value).toBe("TAREAS");
    expect([
      sheet.getCell("A2").value,
      sheet.getCell("B2").value,
      sheet.getCell("C2").value,
      sheet.getCell("D2").value,
      sheet.getCell("E2").value,
      sheet.getCell("F2").value,
    ]).toEqual([
      "Fecha",
      "FECHA",
      "CONCEPTO",
      "PROYECTO",
      "Estado",
      "Comentario",
    ]);
  });

  it("writes the legend row and the TEAMS note", () => {
    expect(String(sheet.getCell("C3").value)).toContain("Breve explicación");
    expect(String(sheet.getCell("D3").value)).toContain("Empresa + ubicación");
    expect(sheet.getCell("E3").value).toBe("Pendiente");
    expect(String(sheet.getCell("F3").value)).toContain(
      "Respuesta/ Resolución",
    );
    expect(String(sheet.getCell("H3").value)).toContain("TEAMS");
  });

  it("starts the data on row 4", () => {
    expect(sheet.getCell("C4").value).toBe(
      "Revisar Puesta a Tierra Torrevieja",
    );
    expect(sheet.getCell("D4").value).toBe("BAUHAUS TORREVIEJA");
    expect(sheet.getCell("E4").value).toBe(".Realizado");
    expect(sheet.getCell("C5").value).toBe("Enviar fotografies CGP");
  });

  // ExcelJS turns a Date straight into a serial with `getTime()`, so anything
  // but UTC midnight would land the cell on the wrong day — or drag a hidden
  // time along with it.
  it("writes each date as UTC midnight of the Madrid day", () => {
    expect(sheet.getCell("A4").value).toEqual(new Date(Date.UTC(2026, 4, 29)));
    expect(sheet.getCell("B4").value).toEqual(new Date(Date.UTC(2026, 5, 3)));
    expect(sheet.getCell("A5").value).toEqual(new Date(Date.UTC(2026, 7, 18)));
  });

  it("formats the date columns as the reader expects", () => {
    expect(sheet.getCell("A4").numFmt).toBe("dd/mm/yyyy");
    expect(sheet.getCell("B4").numFmt).toBe("dd/mm/yyyy");
  });

  it("stacks the comments one per line, with no blank lines", () => {
    expect(sheet.getCell("F4").text).toBe(
      "03/06/2026 — Demanar medicions\nUrgent\n05/06/2026 — Rebut",
    );
    expect(sheet.getCell("F4").alignment?.wrapText).toBe(true);
  });

  it("writes the date of each comment in bold, and only the date", () => {
    const value = sheet.getCell("F4").value as ExcelJS.CellRichTextValue;
    const bold = value.richText
      .filter((run) => run.font?.bold)
      .map((run) => run.text);

    expect(bold).toEqual(["03/06/2026", "05/06/2026"]);
  });

  it("leaves pre-formatted blank rows under the data", () => {
    const firstSpareRow = 4 + rows.length;
    expect(sheet.getCell(`E${firstSpareRow}`).value).toBe("-");
    expect(sheet.getCell(`C${firstSpareRow}`).value).toBeFalsy();
    expect(sheet.getCell(`E${firstSpareRow + 99}`).value).toBe("-");
  });

  it("covers the header and every row with the autofilter", () => {
    expect(sheet.autoFilter).toBe(`A2:F${4 + rows.length + 99}`);
  });

  it("offers the five status values as a dropdown", () => {
    const validations = (
      sheet as unknown as {
        dataValidations: {
          model: Record<
            string,
            { formulae: string[]; showErrorMessage?: boolean }
          >;
        };
      }
    ).dataValidations.model;

    const expected = ['"Pendiente,En curso,Realizado,-,.Realizado"'];
    expect(validations.E3?.formulae).toEqual(expected);
    expect(validations.E4?.formulae).toEqual(expected);
    expect(validations[`E${4 + rows.length + 99}`]?.formulae).toEqual(expected);
    // Without this Excel accepts anything typed over the dropdown in silence.
    expect(validations.E4?.showErrorMessage).toBe(true);
  });

  it("colours the status column the way the original does", () => {
    const formattings = (
      sheet as unknown as {
        conditionalFormattings: Array<{
          ref: string;
          rules: Array<{
            type: string;
            text?: string;
            style?: { fill?: { bgColor?: { argb?: string } } };
          }>;
        }>;
      }
    ).conditionalFormattings;

    expect(formattings).toHaveLength(1);
    expect(formattings[0]?.ref).toBe(`E3:E${4 + rows.length + 99}`);

    const colours = formattings[0]?.rules.map((rule) => [
      rule.type,
      rule.style?.fill?.bgColor?.argb,
    ]);
    expect(colours).toEqual([
      ["containsText", "FFFFC000"],
      ["containsText", "FF92D050"],
      ["containsText", "FFFFFF00"],
    ]);
  });

  it("keeps the column widths of the original", () => {
    expect(sheet.getColumn("C").width).toBeCloseTo(81.57, 2);
    expect(sheet.getColumn("F").width).toBeCloseTo(64.71, 2);
  });

  it("produces a usable sheet with no tasks at all", async () => {
    const buffer = await buildServitecWorkbook([]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const empty = workbook.getWorksheet("Full1");

    expect(empty?.getCell("A2").value).toBe("Fecha");
    expect(empty?.getCell("E4").value).toBe("-");
    expect(empty?.autoFilter).toBe("A2:F103");
  });

  it("leaves the date cells empty when a task has no dates", async () => {
    const buffer = await buildServitecWorkbook([
      {
        fecha: null,
        fechaActualizacion: null,
        concepto: "Sin fechas",
        proyecto: "GOU MENORCA",
        estado: "En curso",
        comentarios: [],
      },
    ]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const loaded = workbook.getWorksheet("Full1");

    expect(loaded?.getCell("A4").value).toBeFalsy();
    expect(loaded?.getCell("C4").value).toBe("Sin fechas");
    expect(loaded?.getCell("E4").value).toBe("En curso");
  });
});
