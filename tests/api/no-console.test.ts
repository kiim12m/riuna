import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// La API registra por `utils/log.ts` (ADR 073): JSON en producción, con
// nivel, `requestId` y secretos tapados. Un `console.*` suelto se salta las
// tres cosas, así que no puede volver.

const SRC = join(__dirname, "../../apps/api/src");
const LOGGER = join(SRC, "utils/log.ts");
const CONSOLE = /\bconsole\.(log|info|warn|error|debug|trace)\b/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith(".ts") ? [path] : [];
  });
}

describe("API logging", () => {
  it("goes through utils/log.ts, never console", () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => file !== LOGGER)
      .flatMap((file) =>
        readFileSync(file, "utf8")
          .split("\n")
          .map((line, index) => ({ line, index }))
          .filter(({ line }) => CONSOLE.test(line))
          .map(({ index }) => `${relative(SRC, file)}:${index + 1}`),
      );

    expect(offenders).toEqual([]);
  });
});
