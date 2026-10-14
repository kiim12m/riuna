import type {
  Content,
  TableCell,
  TDocumentDefinitions,
} from "pdfmake/interfaces";
import { formatGeneratedAt } from "./format";

// El marco comun de los documentos (ADR 091): la marca y de donde sale arriba,
// quien lo genero y la pagina abajo, y una tabla que salta de pagina repitiendo
// la cabecera. Es el papel de la maqueta aprobada.

const INK = "#111827";
const MUTED = "#6b7280";
const RULE = "#d1d5db";
const BRAND = "#0f766e";

export type PdfFrame = {
  /** «Espacio / Proyecto»: de donde sale el documento. */
  context: string;
  title: string;
  subtitle?: string;
  /** Quien lo genero, para el pie. */
  author: string;
  landscape?: boolean;
  content: Content[];
};

export function pdfDocument(frame: PdfFrame): TDocumentDefinitions {
  const generatedAt = new Date();
  return {
    pageSize: "A4",
    pageOrientation: frame.landscape ? "landscape" : "portrait",
    pageMargins: [40, 64, 40, 48],
    info: { title: frame.title, creator: "Riuna", producer: "Riuna" },
    defaultStyle: { font: "Roboto", fontSize: 9, color: INK, lineHeight: 1.2 },
    header: {
      margin: [40, 24, 40, 0],
      columns: [
        {
          text: [
            { text: "■ ", color: BRAND, fontSize: 9 },
            { text: "riuna", bold: true, fontSize: 11 },
          ],
        },
        {
          text: `${frame.context}\n${formatGeneratedAt(generatedAt)}`,
          alignment: "right",
          color: MUTED,
          fontSize: 8,
        },
      ],
    },
    footer: (page, pages) => ({
      margin: [40, 16, 40, 0],
      columns: [
        { text: `Riuna · ${frame.author}`, color: MUTED, fontSize: 8 },
        {
          text: `Página ${page} de ${pages}`,
          alignment: "right",
          color: MUTED,
          fontSize: 8,
        },
      ],
    }),
    content: [
      { text: frame.title, fontSize: 15, bold: true, margin: [0, 0, 0, 2] },
      ...(frame.subtitle
        ? [{ text: frame.subtitle, color: MUTED, margin: [0, 0, 0, 12] }]
        : [{ text: "", margin: [0, 0, 0, 10] }]),
      ...frame.content,
    ] as Content[],
  };
}

export type PdfColumn = {
  header: string;
  /** Las cifras van a la derecha, como en la Tabla. */
  align?: "left" | "right";
  /** `*` reparte el sobrante; `auto` se ajusta a lo que lleva. */
  width?: "*" | "auto" | number;
  /** Una cifra o una fecha no se parte en dos lineas; las de la derecha nunca. */
  noWrap?: boolean;
};

/**
 * Una tabla de datos: cabecera repetida en cada pagina, filas en zebra y, si
 * los hay, totales al pie en negrita.
 */
export function dataTable({
  columns,
  rows,
  totals,
}: {
  columns: PdfColumn[];
  rows: string[][];
  totals?: string[];
}): Content {
  const cell = (
    text: string,
    column: PdfColumn | undefined,
    bold = false,
    // La sangria del arbol va con espacios, que pdfmake recorta si no se le
    // pide lo contrario.
  ): TableCell => ({
    text,
    bold,
    alignment: column?.align ?? "left",
    noWrap: column?.noWrap ?? column?.align === "right",
    preserveLeadingSpaces: true,
  });
  const body: TableCell[][] = [
    columns.map((column) => ({
      text: column.header,
      bold: true,
      color: MUTED,
      alignment: column.align ?? "left",
    })),
    ...rows.map((row) => row.map((text, index) => cell(text, columns[index]))),
  ];
  if (totals) {
    body.push(totals.map((text, index) => cell(text, columns[index], true)));
  }

  return {
    table: {
      headerRows: 1,
      dontBreakRows: true,
      widths: columns.map((column) => column.width ?? "auto"),
      body,
    },
    layout: {
      hLineWidth: (index: number, node: { table: { body: unknown[] } }) =>
        index === 1 || (totals && index === node.table.body.length - 1)
          ? 0.8
          : index === 0 || index === node.table.body.length
            ? 0
            : 0.3,
      vLineWidth: () => 0,
      hLineColor: () => RULE,
      paddingTop: () => 3,
      paddingBottom: () => 3,
      fillColor: (index: number) =>
        index > 0 && index % 2 === 0 ? "#f9fafb" : null,
    },
    margin: [0, 0, 0, 12],
  };
}

/** Pares «etiqueta: valor» en dos columnas, como la ficha de la maqueta. */
export function definitionList(pairs: Array<[string, string]>): Content {
  const visible = pairs.filter(([, value]) => value);
  if (visible.length === 0) return { text: "" };
  return {
    table: {
      widths: [110, "*"],
      body: visible.map(([label, value]) => [
        { text: label, color: MUTED },
        { text: value },
      ]),
    },
    layout: "noBorders",
    margin: [0, 0, 0, 12],
  };
}

export function sectionTitle(text: string): Content {
  return { text, bold: true, fontSize: 11, margin: [0, 4, 0, 6] };
}

export function muted(text: string): Content {
  return { text, color: MUTED, margin: [0, 0, 0, 12] };
}

export function paragraph(text: string): Content {
  return { text, margin: [0, 0, 0, 12] };
}
