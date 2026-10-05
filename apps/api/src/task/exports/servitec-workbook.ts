import ExcelJS from "exceljs";
import { formatSheetDate, toSheetDate } from "../exchange/sheet-dates";

// The SERVITEC daily task board, reproduced from the hand-maintained
// `Tareas- SERVITEC 2026.xlsx`: same sheet name, headers, legend row, column
// widths, status dropdown and conditional colours, so the generated file drops
// straight into the existing routine.
//
// This module only describes the sheet. The day-cutting conversion it first
// needed —Excel's serial number comes off `getTime()` with no timezone
// adjustment— now lives in the exchange engine (`exchange/sheet-dates.ts`,
// ADR 017), which the generic exporter shares.

export type ServitecEstado =
  | "Pendiente"
  | "En curso"
  | "Realizado"
  | ".Realizado";

export type ServitecComment = {
  fecha: Date;
  /** Texto plano: los saltos de linea se conservan, las lineas en blanco no. */
  texto: string;
};

export type ServitecRow = {
  fecha: Date | null;
  fechaActualizacion: Date | null;
  concepto: string;
  proyecto: string;
  estado: ServitecEstado;
  /** En orden de escritura, el mas antiguo primero. */
  comentarios: ServitecComment[];
};

const SHEET_NAME = "Full1";

const DATE_FORMAT = "dd/mm/yyyy";
const FONT = { name: "Aptos Narrow", size: 11 } as const;

const HEADERS = [
  "Fecha",
  "FECHA",
  "CONCEPTO",
  "PROYECTO",
  "Estado",
  "Comentario",
] as const;

// `-` is the filler the blank rows carry; `.Realizado` marks an archived task.
const ESTADO_OPTIONS = [
  "Pendiente",
  "En curso",
  "Realizado",
  "-",
  ".Realizado",
] as const;

const EMPTY_ESTADO = "-";

// Blank pre-formatted rows left under the data so the sheet can still be
// extended by hand, exactly as the original does.
const SPARE_ROWS = 100;

const LEGEND = {
  concepto:
    "Breve explicación.                                                                                                                                                    Ej: Croquis plazas aparcamiento. Drive-in Justificación carpa.",
  proyecto: "Empresa + ubicación                          BAUHAUS TORREVIEJA",
  estado: "Pendiente",
  comentario:
    "Respuesta/ Resolución con comentarios                                                             Ej: No cuadra con las necesidades. 25 perdidas/ 10 ganadas (supuesto 500m²  carpa)",
  nota: "Cada día enviar captura del cuadro en el TEAMS (CONTROL FEINA- X)                                                            Empezamos el día ordenando   - acabamos resolviendo",
} as const;

const COLUMN_WIDTHS: Record<string, number> = {
  A: 16.86,
  B: 8.43,
  C: 81.57,
  D: 23.14,
  E: 17.86,
  F: 64.71,
  G: 8.43,
  H: 51.71,
};

// Theme colours resolved to their RGB equivalents: Accent1 lighter 60% for the
// title, Background1 darker 25% for the header row.
const TITLE_FILL = "FFB4C7E7";
const HEADER_FILL = "FFBFBFBF";

// ExcelJS writes the `<formula>` of a containsText rule but drops the optional
// `operator` and `text` attributes the original carries. Excel evaluates the
// formula, so the colours are identical; the only difference is that "Manage
// rules" shows them as formula rules rather than "cell containing".
const CONDITIONAL_COLOURS = [
  { text: "En curso", argb: "FFFFC000" },
  // Matches `.Realizado` too, which is why both read as done at a glance.
  { text: "Realizado", argb: "FF92D050" },
  { text: "Pendiente", argb: "FFFFFF00" },
] as const;

const TITLE_ROW = 1;
const HEADER_ROW = 2;
const LEGEND_ROW = 3;
const FIRST_DATA_ROW = 4;

type WorksheetWithDataValidations = {
  dataValidations: {
    add(range: string, validation: ExcelJS.DataValidation): void;
  };
};

export async function buildServitecWorkbook(
  rows: ServitecRow[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(SHEET_NAME);

  for (const [column, width] of Object.entries(COLUMN_WIDTHS)) {
    sheet.getColumn(column).width = width;
  }

  const title = sheet.getCell(TITLE_ROW, 2);
  title.value = "TAREAS";
  title.font = { ...FONT, bold: true };
  title.alignment = { horizontal: "center" };
  title.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: TITLE_FILL },
  };
  sheet.mergeCells(TITLE_ROW, 2, TITLE_ROW, 6);

  HEADERS.forEach((header, index) => {
    const cell = sheet.getCell(HEADER_ROW, index + 1);
    cell.value = header;
    cell.font = { ...FONT, bold: true };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: HEADER_FILL },
    };
  });

  writeLegendRow(sheet);

  rows.forEach((row, index) => {
    writeDataRow(sheet, FIRST_DATA_ROW + index, row);
  });

  const firstSpareRow = FIRST_DATA_ROW + rows.length;
  const lastRow = firstSpareRow + SPARE_ROWS - 1;
  for (let rowNumber = firstSpareRow; rowNumber <= lastRow; rowNumber += 1) {
    const cell = sheet.getCell(rowNumber, 5);
    cell.value = EMPTY_ESTADO;
    cell.font = FONT;
    cell.alignment = { horizontal: "center" };
  }

  sheet.autoFilter = {
    from: { row: HEADER_ROW, column: 1 },
    to: { row: lastRow, column: 6 },
  };

  const estadoRange = `E${LEGEND_ROW}:E${lastRow}`;

  // `dataValidations` exists at runtime but ExcelJS never declared it on
  // Worksheet (it is commented out in its own index.d.ts). Setting it per cell
  // is the typed alternative, but that writes one <dataValidation> element per
  // row instead of one for the range.
  (sheet as unknown as WorksheetWithDataValidations).dataValidations.add(
    estadoRange,
    {
      type: "list",
      allowBlank: true,
      // Both default to false when the attribute is absent, and the original
      // sheet warns on a value outside the list. Without these the dropdown
      // still works but silently accepts anything typed over it.
      showInputMessage: true,
      showErrorMessage: true,
      formulae: [`"${ESTADO_OPTIONS.join(",")}"`],
    },
  );

  sheet.addConditionalFormatting({
    ref: estadoRange,
    rules: CONDITIONAL_COLOURS.map((colour, index) => ({
      type: "containsText" as const,
      operator: "containsText" as const,
      text: colour.text,
      priority: index + 1,
      style: {
        fill: {
          type: "pattern" as const,
          pattern: "solid" as const,
          bgColor: { argb: colour.argb },
        },
      },
    })),
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function writeLegendRow(sheet: ExcelJS.Worksheet) {
  const row = sheet.getRow(LEGEND_ROW);
  row.height = 45;

  // A sample date, kept fresh so the legend never reads as a stale entry.
  const sample = sheet.getCell(LEGEND_ROW, 2);
  sample.value = new Date(Date.UTC(new Date().getFullYear(), 0, 1));
  sample.numFmt = DATE_FORMAT;
  sample.font = FONT;
  sample.alignment = { horizontal: "center", vertical: "middle" };

  const concepto = sheet.getCell(LEGEND_ROW, 3);
  concepto.value = LEGEND.concepto;
  concepto.font = FONT;
  concepto.alignment = {
    horizontal: "left",
    vertical: "middle",
    wrapText: true,
  };

  const proyecto = sheet.getCell(LEGEND_ROW, 4);
  proyecto.value = LEGEND.proyecto;
  proyecto.font = { ...FONT, bold: true };
  proyecto.alignment = {
    horizontal: "center",
    vertical: "middle",
    wrapText: true,
  };

  const estado = sheet.getCell(LEGEND_ROW, 5);
  estado.value = LEGEND.estado;
  estado.font = FONT;
  estado.alignment = { horizontal: "center", vertical: "middle" };

  const comentario = sheet.getCell(LEGEND_ROW, 6);
  comentario.value = LEGEND.comentario;
  comentario.font = FONT;
  comentario.alignment = {
    horizontal: "left",
    vertical: "top",
    wrapText: true,
  };

  const nota = sheet.getCell(LEGEND_ROW, 8);
  nota.value = LEGEND.nota;
  nota.font = FONT;
  nota.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
  sheet.mergeCells(LEGEND_ROW, 8, LEGEND_ROW + 1, 8);
}

function writeDataRow(
  sheet: ExcelJS.Worksheet,
  rowNumber: number,
  row: ServitecRow,
) {
  const fecha = sheet.getCell(rowNumber, 1);
  fecha.value = toSheetDate(row.fecha);
  fecha.numFmt = DATE_FORMAT;
  fecha.font = FONT;

  const fechaActualizacion = sheet.getCell(rowNumber, 2);
  fechaActualizacion.value = toSheetDate(row.fechaActualizacion);
  fechaActualizacion.numFmt = DATE_FORMAT;
  fechaActualizacion.font = FONT;

  const concepto = sheet.getCell(rowNumber, 3);
  concepto.value = row.concepto;
  concepto.font = FONT;

  const proyecto = sheet.getCell(rowNumber, 4);
  proyecto.value = row.proyecto;
  proyecto.font = FONT;
  proyecto.alignment = { wrapText: true };

  const estado = sheet.getCell(rowNumber, 5);
  estado.value = row.estado;
  estado.font = FONT;
  estado.alignment = { horizontal: "center" };

  const comentario = sheet.getCell(rowNumber, 6);
  comentario.value = commentCellValue(row.comentarios);
  comentario.font = FONT;
  comentario.alignment = { wrapText: true, vertical: "top" };
}

/**
 * Los comentarios de una tarea, seguidos: uno por linea y sin lineas en blanco
 * ni entre ellos ni dentro de uno, con la fecha en negrita.
 *
 * Texto enriquecido de Excel, porque la negrita es solo de un trozo de la
 * celda. Una linea que no empieza por fecha sigue al comentario de arriba: es
 * lo que tendra que entender quien vuelva a leer la hoja.
 */
function commentCellValue(
  comentarios: readonly ServitecComment[],
): ExcelJS.CellValue {
  if (comentarios.length === 0) return "";

  return {
    richText: comentarios.flatMap((comment, index) => [
      {
        text: formatSheetDate(comment.fecha),
        font: { ...FONT, bold: true },
      },
      {
        text: ` — ${comment.texto.replace(/\n{2,}/g, "\n")}${
          index < comentarios.length - 1 ? "\n" : ""
        }`,
        font: FONT,
      },
    ]),
  };
}
