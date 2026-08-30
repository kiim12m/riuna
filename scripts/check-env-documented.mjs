#!/usr/bin/env node
/**
 * Comprueba que toda variable de entorno que la API lee este documentada en
 * `.env.sample`.
 *
 * La auditoria de la Fase 4.5 encontro 17 sin documentar. La peor,
 * `NOTIFICATION_SECRET_ENCRYPTION_KEY`, devolvia un 500 nombrando una variable
 * que no aparecia en ningun sitio del repositorio: quien desplegaba la buscaba
 * en `.env.sample`, en `ENVIRONMENT_SETUP.md`, en el chart y en los compose, y
 * no estaba en ninguno.
 *
 * Documentar es barato; deducir una variable desde un 500 no lo es.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const API_SRC = "apps/api/src";
const ENV_SAMPLE = ".env.sample";

// Las que pone el propio runtime o el empaquetador, no la configuracion.
const NOT_CONFIGURATION = new Set(["NODE_ENV"]);

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...walk(full));
    } else if (full.endsWith(".ts")) {
      files.push(full);
    }
  }
  return files;
}

const used = new Set();
for (const file of walk(API_SRC)) {
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) {
    used.add(match[1]);
  }
}

const sample = readFileSync(ENV_SAMPLE, "utf8");
const documented = new Set(
  [...sample.matchAll(/^#?\s*([A-Z][A-Z0-9_]*)=/gm)].map((match) => match[1]),
);

const missing = [...used]
  .filter((name) => !NOT_CONFIGURATION.has(name) && !documented.has(name))
  .sort();

if (missing.length > 0) {
  console.error(
    `${ENV_SAMPLE} no documenta ${missing.length} variable(s) que la API lee:\n`,
  );
  for (const name of missing) {
    console.error(`  - ${name}`);
  }
  console.error(
    "\nAnadelas a .env.sample (comentadas, con una linea de que hacen).",
  );
  process.exit(1);
}

console.log(
  `OK: las ${used.size} variables que usa la API estan documentadas.`,
);
