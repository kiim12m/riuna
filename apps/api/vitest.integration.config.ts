import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// Las pruebas corren en la zona de produccion (ADR 049): "hoy" es el dia del
// proceso de la API, y un desfase entre UTC y Madrid solo se ve si se prueba
// con un desfase. Antes de crear los trabajadores, para que lo hereden.
process.env.TZ = "Europe/Madrid";

export default defineConfig({
  test: {
    environment: "node",
    include: ["../../tests/api-integration/**/*.test.ts"],
    setupFiles: ["../../tests/api-integration/setup.ts"],
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
    hookTimeout: 60_000,
    testTimeout: 60_000,
    coverage: {
      enabled: false,
    },
  },
  esbuild: {
    target: "node18",
  },
  resolve: {
    alias: {
      "@riuna/email": resolve(
        __dirname,
        "../../tests/api-integration/mocks/email.ts",
      ),
    },
  },
});
