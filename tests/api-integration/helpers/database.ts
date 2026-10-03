import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";
import db from "../../../apps/api/src/database";
import { settleEvents } from "../../../apps/api/src/events";

const currentDir = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(currentDir, "../../../apps/api/drizzle");

let migrationPromise: Promise<void> | null = null;

function getDatabaseName(connectionString: string) {
  return new URL(connectionString).pathname.replace(/^\//, "");
}

function getAdminDatabaseUrl(connectionString: string) {
  const url = new URL(connectionString);
  url.pathname = "/postgres";
  return url.toString();
}

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function ensureTestDatabaseExists() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL must be defined for integration tests");
  }

  const databaseName = getDatabaseName(connectionString);

  if (!databaseName.endsWith("_test")) {
    throw new Error(
      `Refusing to manage non-test database "${databaseName}". DATABASE_URL must point to a test database.`,
    );
  }

  const adminClient = new Client({
    connectionString: getAdminDatabaseUrl(connectionString),
  });

  await adminClient.connect();

  try {
    const result = await adminClient.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [databaseName],
    );

    if (result.rowCount === 0) {
      await adminClient.query(
        `CREATE DATABASE ${quoteIdentifier(databaseName)}`,
      );
    }
  } finally {
    await adminClient.end();
  }
}

export async function ensureTestDatabaseMigrated() {
  if (!migrationPromise) {
    migrationPromise = (async () => {
      await ensureTestDatabaseExists();
      await migrate(db, {
        migrationsFolder,
      });
    })();
  }

  try {
    await migrationPromise;
  } catch (error) {
    migrationPromise = null;
    throw error;
  }
}

// Ponytail: query Postgres directly. The catalog is the canonical source of
// what tables actually exist after migrations run. Reflecting on the schema
// object in apps/api/src/database misses any table that is not exported from
// the index.ts registry (for example mcp_oauth_state and task_reminder_sent).
async function listPublicTableNames(): Promise<string[]> {
  const result = await db.execute<{ table_name: string }>(sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);

  return result.rows.map((row) => row.table_name);
}

function isDeadlock(error: unknown) {
  // Drizzle envuelve el error de Postgres y deja el codigo en `cause`.
  const code = (error as { code?: string; cause?: { code?: string } })?.cause
    ?.code;
  return code === "40P01" || (error as { code?: string })?.code === "40P01";
}

export async function resetTestDatabase() {
  await ensureTestDatabaseMigrated();

  // Los gestores de eventos de la prueba anterior corren por su cuenta despues
  // de responder, y siguen escribiendo (actividad, avisos) cuando esta pide
  // `ACCESS EXCLUSIVE` sobre todas las tablas: dos transacciones que bloquean
  // en orden distinto son un deadlock. Se espera a que acaben.
  await settleEvents();

  const tableNames = await listPublicTableNames();

  if (tableNames.length === 0) {
    throw new Error(
      "resetTestDatabase found no tables to truncate. Did migrations run?",
    );
  }

  const formattedTableNames = tableNames.map(quoteIdentifier).join(", ");
  const truncate = sql.raw(
    `TRUNCATE TABLE ${formattedTableNames} RESTART IDENTITY CASCADE`,
  );

  // Lo que no es de eventos (un trabajo programado, un WebSocket) no se puede
  // esperar: si aun asi hay un deadlock, Postgres ya ha abortado la otra
  // transaccion o esta, y repetir basta.
  for (let attempt = 1; ; attempt++) {
    try {
      await db.execute(truncate);
      return;
    } catch (error) {
      if (!isDeadlock(error) || attempt >= 3) throw error;
      await settleEvents();
    }
  }
}
