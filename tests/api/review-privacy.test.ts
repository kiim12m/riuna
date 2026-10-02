import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(__dirname, "../../apps/api/src");

/**
 * Los unicos sitios que pueden nombrar la valoracion privada de un cierre: su
 * definicion y el modulo de la propia persona. El responsable de departamento
 * leera los cierres desde otro modulo, y si ese modulo -o cualquier otro- une
 * `review_private`, la valoracion deja de ser privada (ADR 054).
 */
const ALLOWED = [
  "database/schema.ts",
  "database/index.ts",
  "database/relations.ts",
  "review/index.ts",
  "review/save-review.ts",
  "review/controllers/",
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return full.endsWith(".ts") ? [full] : [];
  });
}

describe("review privacy (ADR 054)", () => {
  it("names review_private only where the person reads their own rating", () => {
    const offenders = sourceFiles(SRC)
      .map((file) => path.relative(SRC, file).split(path.sep).join("/"))
      .filter((relative) => {
        const text = readFileSync(path.join(SRC, relative), "utf8");
        return /reviewPrivateTable|review_private/.test(text);
      })
      .filter(
        (relative) => !ALLOWED.some((allowed) => relative.startsWith(allowed)),
      );

    expect(offenders).toEqual([]);
  });
});
