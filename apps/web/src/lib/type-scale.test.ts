import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
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

/**
 * `text-lg` (18 px), `text-xl` (20), `text-2xl` (24), `text-3xl` (30) y
 * `text-4xl` (36) no son ninguno de los
 * siete papeles de `marca.md` §05: la pantalla pide `text-section`,
 * `text-page` o `text-display`. La revision estetica de la Fase 7.5 devolvio a
 * la escala los tamanos arbitrarios, pero sin vigilancia 48 clases mas se
 * colaron despues. Los titulos de los dialogos van a `text-section`, como pide
 * el manual para los modales.
 *
 * **Queda fuera a proposito** `text-7xl`: el reloj del modo foco es un numeral
 * de portada que ningun papel de la escala cubre.
 */
describe("type scale", () => {
  it("uses no text-lg, xl, 2xl, 3xl or 4xl: pick page, section or display", () => {
    const offenders: string[] = [];

    for (const file of sourceFiles(SRC)) {
      const code = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      const found = code.match(
        /(?<![\w-])text-(?:lg|xl|2xl|3xl|4xl)(?![\w-])/g,
      );
      if (found) offenders.push(`${file.replace(SRC, "src")}: ${found[0]}`);
    }

    expect(offenders).toEqual([]);
  });
});
