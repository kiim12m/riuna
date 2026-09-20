import ExcelJS from "exceljs";
import { toSheetDate } from "./sheet-dates";

// Escritor generico del formato de intercambio. Recibe columnas y filas ya
// resueltas: no sabe nada de tareas, y por eso la plantilla de SERVITEC puede
// seguir siendo su propio modulo sin que este tenga que conocerla.

export type ExchangeColumnKind = "text" | "date" | "number";

export type ExchangeSheetColumn = {
  header: string;
  kind: ExchangeColumnKind;
  /** Oculta en la hoja. En CSV no hay columnas ocultas y sale visible. */
  hidden?: boolean;
  width?: number;
};

export type ExchangeSheetRow = {
  /** Un valor por columna, en el mismo orden. */
  cells: Array<string | number | Date | null>;
  /** Profundidad en el arbol: sangra el titulo y agrupa la fila en Excel. */
  outlineLevel?: number;
};

export type ExchangeSheet = {
  sheetName: string;
  columns: ExchangeSheetColumn[];
  rows: ExchangeSheetRow[];
  /** Columna (base 1) que se sangra segun `outlineLevel`. */
  indentColumn?: number;
};

const DATE_FORMAT = "dd/mm/yyyy";
const HEADER_ROW = 1;
const FIRST_DATA_ROW = 2;
const DEFAULT_WIDTH = 18;

export async function buildExchangeWorkbook(
  sheet: ExchangeSheet,
): Promise<Buffer> {
  return buildExchangeWorkbookOf([sheet]);
}

/**
 * Varias hojas en un mismo libro.
 *
 * Existe porque un informe de panel es **una hoja por widget**, y el escritor de
 * una sola hoja ya tenia todo el cableado de ExcelJS —formato de fecha, texto
 * explicito, cabecera congelada, autofiltro—. Copiarlo para la segunda forma
 * era pedir que las dos divergieran en el primer arreglo.
 */
export async function buildExchangeWorkbookOf(
  sheets: ExchangeSheet[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();

  for (const sheet of sheets) {
    addSheet(workbook, sheet);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function addSheet(workbook: ExcelJS.Workbook, sheet: ExchangeSheet) {
  const worksheet = workbook.addWorksheet(sheet.sheetName);

  sheet.columns.forEach((column, index) => {
    const target = worksheet.getColumn(index + 1);
    target.width = column.width ?? DEFAULT_WIDTH;
    if (column.hidden) {
      target.hidden = true;
    }
  });

  const headerRow = worksheet.getRow(HEADER_ROW);
  sheet.columns.forEach((column, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = column.header;
    cell.font = { bold: true };
    cell.alignment = { vertical: "middle" };
  });
  headerRow.commit();

  sheet.rows.forEach((row, rowIndex) => {
    const target = worksheet.getRow(FIRST_DATA_ROW + rowIndex);

    sheet.columns.forEach((column, columnIndex) => {
      const cell = target.getCell(columnIndex + 1);
      const value = row.cells[columnIndex] ?? null;

      if (value instanceof Date) {
        cell.value = toSheetDate(value);
        cell.numFmt = DATE_FORMAT;
      } else if (column.kind === "number" && typeof value === "number") {
        cell.value = value;
      } else if (value === null || value === "") {
        cell.value = null;
      } else {
        cell.value = String(value);
        // Formato de texto explicito: sin el, Excel reinterpreta `1.10` de la
        // columna `Esquema` como el numero 1,1 en cuanto alguien edita la hoja.
        if (column.kind === "text") {
          cell.numFmt = "@";
        }
      }
    });

    const level = row.outlineLevel ?? 0;
    if (level > 0) {
      // Agrupacion plegable nativa: el arbol se recorre en Excel sin que
      // nosotros dibujemos nada.
      target.outlineLevel = Math.min(level, 7);
    }

    if (sheet.indentColumn) {
      target.getCell(sheet.indentColumn).alignment = {
        indent: level,
        vertical: "middle",
        wrapText: false,
      };
    }

    target.commit();
  });

  worksheet.views = [{ state: "frozen", ySplit: HEADER_ROW }];

  if (sheet.rows.length > 0) {
    worksheet.autoFilter = {
      from: { row: HEADER_ROW, column: 1 },
      to: { row: HEADER_ROW, column: sheet.columns.length },
    };
  }
}

/**
 * El mismo cuadro en CSV. Se escribe a mano en vez de con el escritor de
 * ExcelJS por dos razones: aplica su propio formato a numeros y fechas, y no
 * emite BOM, sin el cual Excel abre un CSV UTF-8 con los acentos rotos.
 */
export function buildExchangeCsv(sheet: ExchangeSheet): Buffer {
  const lines = [
    sheet.columns
      .map((column) => neutralizeCsvFormula(column.header))
      .map(escapeCsv),
  ];

  for (const row of sheet.rows) {
    lines.push(
      sheet.columns.map((_, index) =>
        escapeCsv(csvValue(row.cells[index] ?? null)),
      ),
    );
  }

  const body = lines.map((cells) => cells.join(",")).join("\r\n");
  return Buffer.from(`﻿${body}\r\n`, "utf8");
}

function csvValue(value: string | number | Date | null): string {
  if (value === null) return "";
  if (value instanceof Date) {
    const day = toSheetDate(value);
    return day ? day.toISOString().slice(0, 10) : "";
  }
  // Solo el texto: un numero negativo es un numero para Excel, no una formula.
  return typeof value === "string"
    ? neutralizeCsvFormula(value)
    : String(value);
}

// Excel y LibreOffice ejecutan como formula la celda de un CSV que empieza por
// uno de estos caracteres, y cualquiera que pueda titular una tarea puede
// escribir una. Solo miran el primer caracter, asi que un espacio delante
// basta para dejarla en texto (CWE-1236).
//
// Un espacio y no un apostrofo: el importador ya recorta cada celda, asi que
// el texto vuelve intacto sin deshacer nada al leer. Quitar el apostrofo
// habria que hacerlo en todos los CSV, tambien en los que no salieron de
// aqui, y se comeria el que hubiera escrito una persona.
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

function neutralizeCsvFormula(text: string): string {
  return FORMULA_TRIGGER.test(text) ? ` ${text}` : text;
}

function escapeCsv(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}
