import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createApp } from "../src/index";

const { app } = createApp();
const response = await app.request("/api/openapi");

if (!response.ok) {
  throw new Error(`OpenAPI export failed with status ${response.status}`);
}

const spec = await response.json();
// Antes se escribia en apps/docs, la documentacion de Kaneo que Riuna elimino
// en la fase 0. Ahora vive junto a la propia API.
const outputPath = resolve(import.meta.dirname, "../openapi.json");
await writeFile(outputPath, `${JSON.stringify(spec, null, 2)}\n`);
console.log(`OpenAPI exportado a ${outputPath}`);
