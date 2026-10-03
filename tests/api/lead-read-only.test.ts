import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const LEAD = path.resolve(__dirname, "../../apps/api/src/lead");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sources(full);
    return full.endsWith(".ts") ? [full] : [];
  });
}

/**
 * El responsable de departamento solo lee (ADR 059): ningun endpoint de
 * `lead/` registra una ruta que escriba ni toca la base para escribir, ni
 * publica eventos. Marcar a alguien como responsable vive en `team-lead/`.
 * Que tampoco nombre la valoracion privada lo vigila `review-privacy.test.ts`.
 */
const WRITES = [
  /\.(post|put|patch|delete)\(/,
  /\.(insert|update)\(/,
  /publishEvent/,
  /onConflictDo/,
];

describe("lead module is read-only", () => {
  it("has files to check", () => {
    expect(sources(LEAD).length).toBeGreaterThan(0);
  });

  for (const file of sources(LEAD)) {
    it(`${path.relative(LEAD, file)} does not write`, () => {
      const code = readFileSync(file, "utf8");
      for (const pattern of WRITES) {
        expect(
          code,
          `${pattern} in lead/${path.relative(LEAD, file)}`,
        ).not.toMatch(pattern);
      }
    });
  }
});
