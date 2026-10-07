import type { CellValue } from "../exchange/parse-file";
import { cellText } from "../exchange/parse-file";
import { formatSheetDateIso, parseSheetDate } from "../exchange/sheet-dates";
import type { ServitecEstado } from "./servitec-workbook";

// Leer la hoja de SERVITEC (ADR 069): la que exporta Riuna y el cuadro que se
// llevaba a mano antes, que tiene la misma forma pero no la misma exactitud.
// Puro: recibe las celdas ya leidas, para poder probarlo sin ficheros.

export type ServitecComment = { fecha: Date | null; texto: string };

export type ServitecImportRow = {
  /** Fila de la hoja, base 1, como la numera Excel: es lo que cita el informe. */
  row: number;
  /** El id de la tarea, de la columna oculta que pone la exportacion. */
  id: string | null;
  /** El dia de «Fecha», en la convencion de la hoja (medianoche UTC). */
  fecha: Date | null;
  concepto: string;
  proyecto: string;
  estado: ServitecEstado;
  comentarios: ServitecComment[];
};

export class ServitecFormatError extends Error {}

const normalize = (value: string) =>
  value.normalize("NFKD").replace(/\p{M}/gu, "").trim().toLowerCase();

/** Cuantas filas de arriba se miran buscando la de cabeceras. */
const HEADER_SEARCH_ROWS = 10;

type Columns = {
  fecha: number | null;
  concepto: number;
  proyecto: number;
  estado: number | null;
  comentario: number | null;
  id: number | null;
};

/**
 * Las columnas por su cabecera, no por su posicion: el cuadro hecho a mano no
 * tiene por que tenerlas donde las pone la exportacion. «Fecha» y «FECHA» se
 * llaman igual sin mayusculas; la primera es la de alta y la segunda, la de
 * ultima actualizacion, que al importar no se usa.
 */
function findColumns(table: CellValue[][]) {
  for (
    let index = 0;
    index < Math.min(table.length, HEADER_SEARCH_ROWS);
    index += 1
  ) {
    const headers = (table[index] ?? []).map((cell) =>
      normalize(cellText(cell)),
    );
    const at = (name: string) => {
      const position = headers.indexOf(name);
      return position === -1 ? null : position;
    };
    const concepto = at("concepto");
    const proyecto = at("proyecto");
    if (concepto === null || proyecto === null) continue;

    const columns: Columns = {
      fecha: at("fecha"),
      concepto,
      proyecto,
      estado: at("estado"),
      comentario: at("comentario"),
      id: at("id"),
    };
    return { headerRow: index, columns };
  }
  throw new ServitecFormatError(
    "No row names the CONCEPTO and PROYECTO columns: this is not a SERVITEC sheet",
  );
}

function readEstado(value: string): ServitecEstado {
  const text = normalize(value);
  if (text === ".realizado") return ".Realizado";
  if (text === "realizado") return "Realizado";
  if (text === "en curso") return "En curso";
  // «Pendiente», el relleno «-» y una celda vacia.
  return "Pendiente";
}

const DATED_LINE = /^(\d{1,2}\/\d{1,2}\/\d{4})\s*[—–:-]\s*(.*)$/;

/**
 * Los comentarios de una celda. Una linea que empieza por `dd/mm/yyyy —` abre
 * uno nuevo; las demas siguen al de arriba. Lo que haya antes de la primera
 * fecha es un comentario sin fecha propia, que toma la de la fila.
 */
export function parseComments(
  text: string,
  fallback: Date | null,
): ServitecComment[] {
  const comments: ServitecComment[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const dated = DATED_LINE.exec(line);
    const fecha = dated ? parseSheetDate(dated[1] ?? "") : null;
    if (dated && fecha) {
      comments.push({ fecha, texto: (dated[2] ?? "").trim() });
      continue;
    }
    const last = comments.at(-1);
    if (last) last.texto = last.texto ? `${last.texto}\n${line}` : line;
    else comments.push({ fecha: fallback, texto: line });
  }
  return comments.filter((comment) => comment.texto !== "");
}

/** Lee las filas de la hoja; las vacias, los relevos «-» y la leyenda se saltan. */
export function parseServitecRows(table: CellValue[][]): ServitecImportRow[] {
  const { headerRow, columns } = findColumns(table);
  const rows: ServitecImportRow[] = [];

  for (let index = headerRow + 1; index < table.length; index += 1) {
    const cells = table[index] ?? [];
    const text = (column: number | null) =>
      column === null ? "" : cellText(cells[column] ?? null);
    const concepto = text(columns.concepto);
    if (!concepto) continue;
    // La fila de debajo de las cabeceras explica cada columna con un ejemplo.
    if (
      index === headerRow + 1 &&
      normalize(concepto).startsWith("breve explicacion")
    ) {
      continue;
    }

    const fecha =
      columns.fecha === null
        ? null
        : parseSheetDate(cells[columns.fecha] ?? null);
    rows.push({
      row: index + 1,
      id: text(columns.id) || null,
      fecha,
      concepto,
      proyecto: text(columns.proyecto),
      estado: readEstado(text(columns.estado)),
      comentarios: parseComments(text(columns.comentario), fecha),
    });
  }
  return rows;
}

/**
 * La huella de una fila sin id, para reconocerla al volver a subir la misma
 * hoja: proyecto, concepto y dia de alta. Dos filas iguales en la misma hoja se
 * distinguen por su orden.
 */
export function identityKeys(rows: readonly ServitecImportRow[]): string[] {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const base = [
      normalize(row.proyecto),
      normalize(row.concepto),
      row.fecha ? formatSheetDateIso(row.fecha) : "",
    ].join("|");
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base}#${count}`;
  });
}

export const normalizeProjectName = normalize;
