import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// El simulacro de restauracion (deploy/simulacro.sh, ADR 072) pasa el humo
// desde la imagen oficial de Playwright. El navegador va dentro de la imagen
// y @playwright/test solo habla con el de su misma version: si Dependabot sube
// la libreria y la imagen se queda atras, el simulacro falla en el PC, donde
// no lo ve ninguna prueba. Esta lo ve antes.

const ROOT = join(__dirname, "../..");

describe("simulacro de restauracion", () => {
  it("usa la imagen de Playwright de la version instalada", () => {
    const installed = JSON.parse(
      readFileSync(
        join(ROOT, "node_modules/@playwright/test/package.json"),
        "utf8",
      ),
    ).version as string;
    const compose = readFileSync(
      join(ROOT, "deploy/simulacro.compose.yml"),
      "utf8",
    );
    const tag = compose.match(
      /mcr\.microsoft\.com\/playwright:v([\d.]+)-/,
    )?.[1];

    expect(tag).toBe(installed);
  });

  // Revision de la Fase 9, hallazgo 3: la copia real trae webhooks y tokens
  // en claro. Lo restaurado no puede salir a la red ni programar nada.
  it("apaga la salida a la red y el planificador de lo restaurado", () => {
    const script = readFileSync(join(ROOT, "deploy/simulacro.sh"), "utf8");

    expect(script).toContain('echo "RIUNA_DISABLE_OUTBOUND=true"');
    expect(script).toContain('echo "RIUNA_DISABLE_SCHEDULER=true"');
  });

  // Revision de la Fase 9, hallazgo 9: el .env de la instancia de verdad no
  // entra en el contenedor del humo.
  it("no copia ningun .env al contenedor del humo", () => {
    const compose = readFileSync(
      join(ROOT, "deploy/simulacro.compose.yml"),
      "utf8",
    );

    expect(compose).toContain("--exclude='.env' --exclude='.env.*'");
  });
});
