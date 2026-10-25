// Flattens a comment/description body to plain text for destinations that
// cannot render anything — a spreadsheet cell, for instance.
//
// Bodies are Markdown (`editor.getMarkdown()`), with the editor's atom nodes
// embedded as `<riuna-*>` tags and, in content written before the Kaneo->Riuna rename, occasional raw HTML. Those atoms are
// turned into the text a reader expects (`@name`, an issue key) rather than
// dropped, since they often carry the point of the sentence.
//
// List markers are deliberately kept: a bulleted cell reads better than one
// long run-on line.

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function attr(tag: string, name: string) {
  const match = new RegExp(String.raw`\b${name}="([^"]*)"`, "i").exec(tag);
  return match?.[1] ?? "";
}

export function richTextToPlainText(
  content: string | null | undefined,
): string {
  if (!content) return "";

  return (
    content
      .replace(/\r\n/g, "\n")
      // Editor atoms, before the generic tag strip below eats their attributes.
      .replace(
        /<(?:riuna|kaneo)-mention\b[^>]*>(?:<\/(?:riuna|kaneo)-mention>)?/gi,
        (tag) => {
          const label = attr(tag, "label");
          return label ? `@${label}` : "";
        },
      )
      .replace(
        /<(?:riuna|kaneo)-issue-link\b[^>]*\/?>(?:<\/(?:riuna|kaneo)-issue-link>)?/gi,
        (tag) => attr(tag, "issue-key") || attr(tag, "url"),
      )
      .replace(
        /<(?:riuna|kaneo)-attachment\b[^>]*\/?>(?:<\/(?:riuna|kaneo)-attachment>)?/gi,
        (tag) => attr(tag, "name") || attr(tag, "filename") || "",
      )
      // Block-level HTML becomes a line break so paragraphs do not run together.
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:p|div|li|h[1-6]|tr|blockquote)>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      // Markdown syntax.
      .replace(/^```.*$/gm, "")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/^\s{0,3}#{1,6}\s+/gm, "")
      .replace(/^\s{0,3}>\s?/gm, "")
      .replace(/^\s{0,3}(?:[-*_])\s*(?:[-*_]\s*){2,}$/gm, "")
      .replace(/(\*\*\*|___)(.+?)\1/g, "$2")
      .replace(/(\*\*|__)(.+?)\1/g, "$2")
      .replace(/(?<!\S)([*_])(?=\S)(.+?)(?<=\S)\1(?!\S)/g, "$2")
      .replace(/~~(.+?)~~/g, "$1")
      .replace(/`+([^`]+)`+/g, "$1")
      .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (entity, body: string) => {
        if (body.startsWith("#x") || body.startsWith("#X")) {
          return String.fromCodePoint(Number.parseInt(body.slice(2), 16));
        }
        if (body.startsWith("#")) {
          return String.fromCodePoint(Number.parseInt(body.slice(1), 10));
        }
        return ENTITIES[body.toLowerCase()] ?? entity;
      })
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+$/gm, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}
