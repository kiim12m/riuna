import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// `node dist/migrate.js` (ADR 071) es lo que `deploy/actualizar.sh` lanza con
// la imagen nueva antes de cambiar la que sirve. Lo unico que el guion lee de
// el es el codigo de salida, asi que eso es lo que se prueba: en un proceso
// aparte, como corre de verdad, y contra una base propia, no la de las pruebas.

const currentDir = dirname(fileURLToPath(import.meta.url));
const apiDir = resolve(currentDir, "../../apps/api");

const testUrl = new URL(process.env.DATABASE_URL ?? "");
const databaseName = testUrl.pathname
  .replace(/^\//, "")
  .replace(/_test$/, "_migrate_cmd_test");
const databaseUrl = new URL(testUrl);
databaseUrl.pathname = `/${databaseName}`;
const adminUrl = new URL(testUrl);
adminUrl.pathname = "/postgres";

const journal = JSON.parse(
  readFileSync(resolve(apiDir, "drizzle/meta/_journal.json"), "utf8"),
) as { entries: unknown[] };

async function admin(statement: string) {
  const client = new Client({ connectionString: adminUrl.toString() });
  await client.connect();
  try {
    await client.query(statement);
  } finally {
    await client.end();
  }
}

async function query<T>(statement: string) {
  const client = new Client({ connectionString: databaseUrl.toString() });
  await client.connect();
  try {
    return (await client.query(statement)).rows as T[];
  } finally {
    await client.end();
  }
}

async function recreateDatabase() {
  await admin(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
  await admin(`CREATE DATABASE "${databaseName}"`);
}

function runMigrateCommand() {
  return new Promise<number | null>((resolveExit, reject) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "src/migrate.ts"],
      {
        cwd: apiDir,
        env: { ...process.env, DATABASE_URL: databaseUrl.toString() },
        stdio: "ignore",
      },
    );
    child.on("error", reject);
    child.on("exit", (code) => resolveExit(code));
  });
}

async function appliedMigrations() {
  const [row] = await query<{ count: string }>(
    "select count(*) from drizzle.__drizzle_migrations",
  );
  return Number(row?.count);
}

describe("migrate command", () => {
  beforeAll(async () => {
    await recreateDatabase();
  });

  afterAll(async () => {
    await admin(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
  });

  it("migrates an empty database and exits with 0", async () => {
    expect(await runMigrateCommand()).toBe(0);
    expect(await appliedMigrations()).toBe(journal.entries.length);
  }, 180_000);

  it("is a no-op on a database that is already migrated", async () => {
    expect(await runMigrateCommand()).toBe(0);
    expect(await appliedMigrations()).toBe(journal.entries.length);
  }, 180_000);

  it("exits with 1 when a migration fails", async () => {
    await recreateDatabase();
    // La primera migracion crea `user`; con una tabla ajena ya en su sitio,
    // falla igual que fallaria un esquema que no es el esperado.
    await query('create table "user" (id integer)');

    expect(await runMigrateCommand()).toBe(1);
  }, 180_000);
});
