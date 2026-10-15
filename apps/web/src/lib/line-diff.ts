// Diferencias por lineas entre dos textos, para el historial de la wiki (ADR
// 092). Una subsecuencia comun mas larga clasica: las paginas son cortas y una
// dependencia para esto no se justifica.

export type DiffLine = { kind: "same" | "added" | "removed"; text: string };

/** Por encima de esto se compara sin alinear, para no colgar el navegador. */
const MAX_CELLS = 4_000_000;

export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");

  if (a.length * b.length > MAX_CELLS) {
    return [
      ...a.map((text) => ({ kind: "removed" as const, text })),
      ...b.map((text) => ({ kind: "added" as const, text })),
    ];
  }

  // `lcs[i * width + j]`: longitud comun de `a[i..]` y `b[j..]`, en una
  // tabla plana.
  const width = b.length + 1;
  const lcs = new Uint32Array((a.length + 1) * width);
  const at = (i: number, j: number) => lcs[i * width + j] ?? 0;
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lcs[i * width + j] =
        a[i] === b[j]
          ? at(i + 1, j + 1) + 1
          : Math.max(at(i + 1, j), at(i, j + 1));
    }
  }

  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      lines.push({ kind: "same", text: a[i] ?? "" });
      i += 1;
      j += 1;
    } else if (at(i + 1, j) >= at(i, j + 1)) {
      lines.push({ kind: "removed", text: a[i] ?? "" });
      i += 1;
    } else {
      lines.push({ kind: "added", text: b[j] ?? "" });
      j += 1;
    }
  }
  while (i < a.length) lines.push({ kind: "removed", text: a[i++] ?? "" });
  while (j < b.length) lines.push({ kind: "added", text: b[j++] ?? "" });
  return lines;
}

/**
 * El Markdown tal como se lee: las fichas de tarea, pagina y mencion como su
 * texto, sin etiquetas. Para que una diferencia no sea un muro de atributos.
 */
export function readableMarkdown(markdown: string) {
  return markdown
    .replace(
      /<(?:riuna|kaneo)-mention\b[^>]*\blabel="([^"]*)"[^>]*>(?:<\/(?:riuna|kaneo)-mention>)?/gi,
      "@$1",
    )
    .replace(
      /<(?:riuna|kaneo)-issue-link\b[^>]*\bissue-key="([^"]+)"[^>]*\/?>/gi,
      "$1",
    )
    .replace(/<(?:riuna|kaneo)-issue-link\b[^>]*\/?>/gi, "#tarea")
    .replace(/<riuna-page-link\b[^>]*\btitle="([^"]*)"[^>]*\/?>/gi, "[[$1]]")
    .replace(/<[^>]+>/g, "");
}
