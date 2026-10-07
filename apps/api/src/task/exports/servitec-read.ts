import ExcelJS from "exceljs";
import { HTTPException } from "hono/http-exception";
import { type CellValue, normalizeCell } from "../exchange/parse-file";
import { parseServitecRows, ServitecFormatError } from "./servitec-parse";

/** Las filas de la primera hoja del libro, o un 400 que dice por que no. */
export async function readSheet(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new HTTPException(400, {
      message: "The file is not an .xlsx workbook",
    });
  }
  const sheet = workbook.worksheets[0];
  if (!sheet)
    throw new HTTPException(400, { message: "The workbook is empty" });
  const table: CellValue[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row, number) => {
    const values = (row.values as ExcelJS.CellValue[]).slice(1);
    table[number - 1] = values.map((value) => normalizeCell(value));
  });
  try {
    return parseServitecRows(Array.from(table, (row) => row ?? []));
  } catch (error) {
    if (error instanceof ServitecFormatError) {
      throw new HTTPException(400, { message: error.message });
    }
    throw error;
  }
}
