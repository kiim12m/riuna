import { Readable } from "node:stream";
import ExcelJS from "exceljs";

// Lector de los dos formatos que la fase acepta. Devuelve una tabla de celdas
// sin interpretar: quien decide que significa cada columna es el mapeo, no
// esto.
//
// Dos avisos que costaron tiempo averiguar:
//
//  - El lector de CSV de ExcelJS **convierte tipos por su cuenta**: `1.1` se
//    volveria el numero 1,1 y `1.10` colapsaria en el mismo valor, que es
//    justo la columna `Esquema`. Se le pasa un `map` propio para que devuelva
//    el texto tal cual.
//  - `xlsx.load()` carga el libro entero en memoria. El limite de tamano se
//    aplica antes de llegar aqui, en el middleware de la ruta.

/** Techo de filas de datos. El mismo que ya usa la exportacion. */
export const MAX_IMPORT_ROWS = 20_000;

/** Lo que una celda puede ser antes de interpretarla. */
export type CellValue = string | Date | null;

export type ParsedSheet = {
  headers: string[];
  rows: CellValue[][];
};

export class FileParseError extends Error {}

const XLSX_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

/** Un `.xlsx` es un ZIP, y un ZIP empieza por `PK\x03\x04`. */
export function looksLikeXlsx(buffer: Buffer): boolean {
  return buffer.subarray(0, 4).equals(XLSX_MAGIC);
}

/**
 * Lee un fichero subido. El tipo se decide por el contenido y, si el contenido
 * no lo dice, por la extension; nunca por el `Content-Type` que declara el
 * navegador, que en Windows llega como `application/octet-stream` la mitad de
 * las veces.
 */
export async function parseUploadedFile(
  buffer: Buffer,
  filename: string,
): Promise<ParsedSheet> {
  if (buffer.length === 0) {
    throw new FileParseError("The file is empty");
  }

  const sheet = looksLikeXlsx(buffer)
    ? await parseXlsx(buffer)
    : await parseCsv(buffer);

  if (sheet.headers.length === 0) {
    throw new FileParseError(
      `"${filename}" has no header row: the first row must name the columns`,
    );
  }

  if (sheet.rows.length > MAX_IMPORT_ROWS) {
    throw new FileParseError(
      `The file has ${sheet.rows.length} rows and the limit is ${MAX_IMPORT_ROWS}`,
    );
  }

  return sheet;
}

async function parseXlsx(buffer: Buffer): Promise<ParsedSheet> {
  const workbook = new ExcelJS.Workbook();

  try {
    // El tipo declarado pide un ArrayBuffer; ExcelJS acepta un Buffer de Node
    // sin mas, que es lo que llega de la subida.
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch (error) {
    throw new FileParseError(
      `The spreadsheet could not be read: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new FileParseError("The workbook has no sheets");
  }

  return splitHeaderRow(readRows(worksheet));
}

async function parseCsv(buffer: Buffer): Promise<ParsedSheet> {
  const workbook = new ExcelJS.Workbook();

  let worksheet: ExcelJS.Worksheet;
  try {
    worksheet = await workbook.csv.read(Readable.from(buffer), {
      // Sin esto, ExcelJS convierte a numero y a fecha lo que le parece. La
      // columna `Esquema` no sobrevive: `1.10` se volveria `1.1`.
      map: (value: string) => value,
    });
  } catch (error) {
    throw new FileParseError(
      `The CSV could not be read: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }

  return splitHeaderRow(readRows(worksheet));
}

function readRows(worksheet: ExcelJS.Worksheet): CellValue[][] {
  const table: CellValue[][] = [];
  const width = worksheet.columnCount;

  worksheet.eachRow({ includeEmpty: false }, (row) => {
    const cells: CellValue[] = [];
    // `eachCell` sin `includeEmpty` se salta los huecos, y entonces las
    // columnas dejan de alinearse con la cabecera. Se recorre por indice.
    for (let column = 1; column <= width; column += 1) {
      cells.push(normalizeCell(row.getCell(column).value));
    }
    table.push(cells);
  });

  return table;
}

/**
 * Aplana lo que ExcelJS devuelve —texto enriquecido, formulas, hipervinculos—
 * a texto, y conserva las fechas como fechas para no perder el dia por el
 * camino.
 */
export function normalizeCell(value: ExcelJS.CellValue): CellValue {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (typeof value === "object") {
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("");
    }
    if ("text" in value && typeof value.text === "string") {
      return value.text;
    }
    if ("result" in value) {
      return normalizeCell(value.result as ExcelJS.CellValue);
    }
    if ("error" in value) {
      return null;
    }
  }

  return String(value);
}

/** El texto de una celda, recortado. */
export function cellText(value: CellValue): string {
  if (value === null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value.trim();
}

function splitHeaderRow(table: CellValue[][]): ParsedSheet {
  const [headerRow, ...rest] = table;

  if (!headerRow) {
    return { headers: [], rows: [] };
  }

  const headers = headerRow.map(cellText);

  // Columnas sin titulo a la derecha: una hoja las arrastra con solo haber
  // tocado una celda alguna vez.
  while (headers.length > 0 && headers[headers.length - 1] === "") {
    headers.pop();
  }

  const rows = rest
    .map((row) => row.slice(0, headers.length))
    .filter((row) => row.some((cell) => cellText(cell) !== ""));

  return { headers, rows };
}
