import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getDatabasePool } from "./database";
import { runMigrations } from "./database/run-migrations";
import { log } from "./utils/log";

/**
 * `node dist/migrate.js`: migra y sale, sin servir nada (ADR 071).
 *
 * Es lo que permite a `deploy/actualizar.sh` migrar con la imagen nueva
 * **antes** de cambiar la que sirve, y saber por el código de salida si la base
 * se llegó a tocar, en vez de buscarlo en el log de un contenedor que se
 * reinicia. Sale con 0 si todo pasa y con 1 si no.
 */
const currentDir = dirname(fileURLToPath(import.meta.url));

try {
  await runMigrations({ migrationsFolder: `${currentDir}/../drizzle` });
  await getDatabasePool().end();
  process.exit(0);
} catch (error) {
  log.error("❌ Database migration failed!", error);
  process.exit(1);
}
