import { sql } from "drizzle-orm";
import db from "../database";
import { log } from "./log";

/**
 * Migration script to:
 * 1. Rename active_workspace_id to active_organization_id in session table
 * 2. Add created_at column to invitation table if it doesn't exist
 * This runs before Drizzle migrations to ensure the column names match the schema.
 */
export async function migrateSessionColumn() {
  log.info(
    "🔄 Checking session table for active_workspace_id to active_organization_id migration...",
  );

  try {
    // Migrate session table column
    const sessionTableExists = await db.execute(sql`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_name = 'session'
      ) AS exists;
    `);

    const sessionExists =
      sessionTableExists.rows[0]?.exists === true ||
      sessionTableExists.rows[0]?.exists === "t";
    if (sessionExists) {
      // Check if active_workspace_id column exists
      const hasOldColumn = await db.execute(sql`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'session'
        AND column_name = 'active_workspace_id'
      `);

      // Check if active_organization_id column already exists
      const hasNewColumn = await db.execute(sql`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'session'
        AND column_name = 'active_organization_id'
      `);

      if (hasOldColumn.rows.length > 0 && hasNewColumn.rows.length === 0) {
        log.info(
          "📝 Found active_workspace_id column, renaming to active_organization_id...",
        );
        await db.execute(sql`
          ALTER TABLE "session" 
          RENAME COLUMN "active_workspace_id" TO "active_organization_id";
        `);
        log.info(
          "✅ Successfully renamed active_workspace_id to active_organization_id",
        );
      } else if (hasNewColumn.rows.length > 0) {
        log.info(
          "✅ active_organization_id column already exists; skipping migration.",
        );
      } else if (hasOldColumn.rows.length === 0) {
        log.info(
          "🛈 active_workspace_id column does not exist; skipping migration.",
        );
      }
    } else {
      log.info("🛈 session table does not exist; skipping migration.");
    }

    // Migrate invitation table - add created_at column
    log.info("🔄 Checking invitation table for created_at column migration...");

    const invitationTableExists = await db.execute(sql`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_name = 'invitation'
      ) AS exists;
    `);

    const invitationExists =
      invitationTableExists.rows[0]?.exists === true ||
      invitationTableExists.rows[0]?.exists === "t";

    if (invitationExists) {
      const hasCreatedAt = await db.execute(sql`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'invitation'
        AND column_name = 'created_at'
      `);

      if (hasCreatedAt.rows.length === 0) {
        log.info("📝 Adding created_at column to invitation table...");
        // Add column as nullable first
        await db.execute(sql`
          ALTER TABLE "invitation" 
          ADD COLUMN "created_at" timestamp;
        `);

        // Set default value for existing rows (use expires_at - 1 month as a reasonable default)
        await db.execute(sql`
          UPDATE "invitation" 
          SET "created_at" = COALESCE("expires_at" - INTERVAL '1 month', NOW())
          WHERE "created_at" IS NULL;
        `);

        // Now make it NOT NULL with default
        await db.execute(sql`
          ALTER TABLE "invitation" 
          ALTER COLUMN "created_at" SET DEFAULT NOW(),
          ALTER COLUMN "created_at" SET NOT NULL;
        `);
        log.info("✅ Successfully added created_at column to invitation table");
      } else {
        log.info(
          "✅ created_at column already exists in invitation table; skipping migration.",
        );
      }
    } else {
      log.info("🛈 invitation table does not exist; skipping migration.");
    }
  } catch (error) {
    log.error("❌ Error during migration:", error);
    throw error;
  }
}
