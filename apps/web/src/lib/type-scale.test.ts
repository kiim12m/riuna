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
 * `text-lg` (18 px), `text-2xl` (24) y `text-4xl` (36) no son ninguno de los
 * siete papeles de `marca.md` §05: la pantalla pide `text-section`,
 * `text-page` o `text-display`. La revision estetica de la Fase 7.5 devolvio a
 * la escala los tamanos arbitrarios, pero sin vigilancia 48 clases mas se
 * colaron despues.
 *
 * **Quedan fuera a proposito** `text-xl`, `text-3xl` y `text-7xl`: los titulos
 * de los dialogos, el onboarding, el logotipo, el error publico y el reloj del
 * modo foco. Son otra decision visual (los modales piden 16 px y hoy llevan 20)
 * y estan apuntados en el plan.
 */
describe("type scale", () => {
  it("uses no text-lg, text-2xl or text-4xl: pick page, section or display", () => {
    const offenders: string[] = [];

    for (const file of sourceFiles(SRC)) {
      const code = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      const found = code.match(/(?<![\w-])text-(?:lg|2xl|4xl)(?![\w-])/g);
      if (found) offenders.push(`${file.replace(SRC, "src")}: ${found[0]}`);
    }

    expect(offenders).toEqual([]);
  });
});
