import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// La zona de quien usa Riuna (ADR 049): las fechas de dia que pinta el web se
// prueban con el desfase real con UTC, no sin el. Antes de crear los
// trabajadores, para que lo hereden.
process.env.TZ = "Europe/Madrid";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      enabled: false,
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@i18n": path.resolve(__dirname, "../../i18n"),
    },
  },
});
