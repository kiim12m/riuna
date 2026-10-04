import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parseSync, traverse } from "@babel/core";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name)
      ? [path]
      : [];
  });
}

/** Atributos cuyo valor lee una persona (o su lector de pantalla). */
const COPY_ATTRIBUTES = new Set([
  "aria-label",
  "title",
  "placeholder",
  "alt",
  "label",
  "subtitle",
  "description",
  "heading",
  "emptyLabel",
]);

const TOAST_METHODS = new Set([
  "success",
  "error",
  "message",
  "info",
  "warning",
]);

/**
 * Lo que no se traduce: nombres propios y siglas, teclas, y ejemplos dentro de
 * un `placeholder` (un codigo de moneda, una clave de proyecto, una URL).
 */
const NOT_TRANSLATED = new Set([
  "Google",
  "Discord",
  "Gantt",
  "Riuna",
  "riuna",
  "Esc",
  "Tab",
  "PRO",
  "EUR",
  "https://gitea.example.com",
]);

/**
 * Ficheros fuera de la vigilancia, cada uno con su razon. Que un fichero este
 * aqui es una deuda, no una excepcion.
 */
const EXEMPT_FILES = new Set([
  // Facturacion heredada, apagada por configuracion: deuda abierta a proposito
  // hasta que se decida que hacer con ella (docs/plan.md).
  "routes/_layout/_authenticated/dashboard/workspace/$workspaceId/admin/workspace/billing.tsx",
  // Pagina de prueba del manejo de errores, solo para desarrollo.
  "components/ui/error-test.tsx",
]);

const looksLikeCopy = (text: string) =>
  /[A-Za-z]{3,}/.test(text) && !NOT_TRANSLATED.has(text.trim());

function findHardcodedCopy(file: string): string[] {
  const ast = parseSync(readFileSync(file, "utf8"), {
    filename: file,
    configFile: false,
    babelrc: false,
    sourceType: "module",
    parserOpts: { plugins: ["jsx", "typescript"] },
  });
  if (!ast) throw new Error(`No se pudo leer ${file}`);
  const found: string[] = [];
  const report = (line: number | undefined, text: string) =>
    found.push(
      `${relative(SRC, file)}:${line ?? 0}  ${text.trim().slice(0, 60)}`,
    );

  traverse(ast, {
    JSXText(path) {
      const text = path.node.value;
      if (looksLikeCopy(text)) {
        report(path.node.loc?.start.line, text.replace(/\s+/g, " "));
      }
    },
    JSXAttribute(path) {
      const { name, value } = path.node;
      if (
        name.type === "JSXIdentifier" &&
        COPY_ATTRIBUTES.has(name.name) &&
        value?.type === "StringLiteral" &&
        looksLikeCopy(value.value)
      ) {
        report(path.node.loc?.start.line, `${name.name}="${value.value}"`);
      }
    },
    CallExpression(path) {
      const { callee, arguments: args } = path.node;
      const first = args[0];
      if (
        callee.type === "MemberExpression" &&
        callee.object.type === "Identifier" &&
        callee.object.name === "toast" &&
        callee.property.type === "Identifier" &&
        TOAST_METHODS.has(callee.property.name) &&
        first?.type === "StringLiteral" &&
        looksLikeCopy(first.value)
      ) {
        report(
          first.loc?.start.line,
          `toast.${callee.property.name}("${first.value}")`,
        );
      }
    },
  });
  return found;
}

describe("hardcoded copy", () => {
  it("has no user-facing text written by hand: it goes through t()", () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => !EXEMPT_FILES.has(relative(SRC, file)))
      .flatMap(findHardcodedCopy);

    expect(offenders).toEqual([]);
  });
});
