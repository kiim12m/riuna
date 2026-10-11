import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { migrateColumns } from "../migrations/column-migration";
import { migrateGitHubIntegration } from "../plugins/github/migration";
import { migrateApiKeyReferenceId } from "../utils/migrate-apikey-reference-id";
import { migrateNotificationPreferencesSchema } from "../utils/migrate-notification-preferences-schema";
import { migrateSessionColumn } from "../utils/migrate-session-column";
import { migrateWorkspaceUserEmail } from "../utils/migrate-workspace-user-email";
import { seedDefaultWorkspaceRoles } from "../utils/seed-default-workspace-roles";
import { warnIfDatabaseIsNotUtc } from "../utils/warn-if-database-not-utc";
import { getDatabase } from ".";
import { prepareDatabaseStartup } from "./prepare-database-startup";
import { waitForDatabase } from "./wait-for-database";

/**
 * Todo lo que deja la base en el esquema de este código, sin servir nada.
 *
 * Lo llaman el arranque normal y la orden `migrate` (ADR 071), que migra
 * **antes** de cambiar la imagen que sirve. Solo el paso de drizzle va en una
 * transacción: si algo falla, la base puede haber quedado a medias, y la salida
 * es la copia hecha justo antes, no volver a la imagen vieja.
 *
 * `migrationsFolder` lo pone quien llama porque depende de dónde vive el punto
 * de entrada: `src/` con tsx, `dist/` empaquetado.
 */
export async function runMigrations({
  migrationsFolder,
}: {
  migrationsFolder: string;
}) {
  await prepareDatabaseStartup({
    waitForDatabase: async () => {
      await waitForDatabase({
        query: async () => {
          await getDatabase().execute(sql`SELECT 1`);
        },
      });
    },
    runStartupMigrations: async () => {
      await migrateWorkspaceUserEmail();
      await migrateSessionColumn();

      console.log("🔄 Migrating database...");

      // Un cerrojo de sesion alrededor de las migraciones, por dos motivos.
      //
      // 1. Drizzle lee la ultima migracion aplicada **fuera** de la transaccion
      //    y luego envuelve el bucle entero en una sola. Con mas de una replica
      //    arrancando a la vez, las dos ven las mismas pendientes; la segunda
      //    espera a la primera y despues reejecuta `ALTER TABLE ... ADD COLUMN`,
      //    que falla con «column already exists» y tumba el proceso.
      // 2. `lock_timeout` acota lo que se espera por un bloqueo de tabla: sin
      //    el, un pod viejo que siga sirviendo durante un despliegue progresivo
      //    se encola detras del `ALTER TABLE` y deja de responder, sin limite.
      //
      // El 1524 y el 1148 son los otros dos espacios de nombres de cerrojo del
      // repositorio (ordenacion de proyectos y escrituras de arbol).
      const database = getDatabase();

      await database.execute(sql`SET lock_timeout = '30s'`);
      await database.execute(sql`SELECT pg_advisory_lock(2051)`);

      try {
        await migrate(database, { migrationsFolder });
      } finally {
        await database.execute(sql`SELECT pg_advisory_unlock(2051)`);
        await database.execute(sql`SET lock_timeout = DEFAULT`);
      }

      console.log("✅ Database migrated successfully!");
    },
  });

  // After Drizzle migrations: apikey table must exist so we can align columns
  // with Better Auth (reference_id + nullable user_id).
  await migrateApiKeyReferenceId();

  await migrateNotificationPreferencesSchema();
  await migrateGitHubIntegration();
  await migrateColumns();
  await warnIfDatabaseIsNotUtc();
  await seedDefaultWorkspaceRoles();
}
