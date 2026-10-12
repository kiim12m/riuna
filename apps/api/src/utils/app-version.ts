import { readFileSync } from "node:fs";

// Empaquetado, este código vive en `apps/api/dist/index.js`; con tsx, en
// `apps/api/src/utils/`. Las dos rutas llevan al `package.json` raíz.
const CANDIDATES = ["../../../package.json", "../../../../package.json"];

/**
 * La versión del `package.json` raíz, o `undefined` si no se encuentra. La
 * leen Sentry (`instrument.ts`) y el estado de la instancia.
 */
export function readAppVersion(): string | undefined {
  for (const candidate of CANDIDATES) {
    try {
      const pkg = JSON.parse(
        readFileSync(new URL(candidate, import.meta.url), "utf8"),
      );
      if (pkg.name === "riuna" && typeof pkg.version === "string") {
        return pkg.version;
      }
    } catch {
      // El siguiente.
    }
  }
  return undefined;
}
