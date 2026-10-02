import { defineConfig } from "vitest/config";

// Las pruebas corren en la zona de produccion (ADR 049): "hoy" es el dia del
// proceso de la API, y un desfase entre UTC y Madrid solo se ve si se prueba
// con un desfase. Antes de crear los trabajadores, para que lo hereden.
process.env.TZ = "Europe/Madrid";

export default defineConfig({
  test: {
    environment: "node",
    include: ["../../tests/api/**/*.test.ts"],
    coverage: {
      enabled: false,
      provider: "v8",
      reporter: ["text", "html"],
      reportsDirectory: "./coverage",
    },
  },
  esbuild: {
    target: "node18",
  },
});
