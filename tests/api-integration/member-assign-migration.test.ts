import { readFileSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { defaultRolePayloads } from "../../packages/permissions/src";
import { resetTestDatabase } from "./helpers/database";
import { createWorkspaceMember } from "./helpers/fixtures";

// Ejecuta el SQL de la migracion, que es lo que llega a una instalacion con
// datos: cambiar `packages/permissions` solo alcanza a los espacios nuevos,
// porque la fila de `workspace_role` manda sobre la definicion compilada.
async function runMemberCanAssignMigration() {
  const file = new URL(
    "../../apps/api/drizzle/0078_member_can_assign_tasks.sql",
    import.meta.url,
  );
  const statements = readFileSync(file, "utf8")
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await db.execute(sql.raw(statement));
  }
}

// El reparto de `task` con el que se sembraba `member` antes de la migracion.
const SEEDED_BEFORE = {
  ...defaultRolePayloads.member,
  task: ["create", "read", "update"],
};

async function insertRole(workspaceId: string, role: string, raw: string) {
  const [row] = await db
    .insert(schema.workspaceRoleTable)
    .values({ workspaceId, role, permission: raw })
    .returning({ id: schema.workspaceRoleTable.id });
  if (!row) throw new Error("Failed to seed role");
  return row.id;
}

async function readPermission(id: string) {
  const [row] = await db
    .select({ permission: schema.workspaceRoleTable.permission })
    .from(schema.workspaceRoleTable)
    .where(eq(schema.workspaceRoleTable.id, id));
  return row?.permission ?? "";
}

describe("migration 0078: member can assign tasks", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("gives `assign` to a member row seeded before, leaving the rest as it was", async () => {
    const { workspace } = await createWorkspaceMember();
    const untouched = await insertRole(
      workspace.id,
      "member",
      JSON.stringify(SEEDED_BEFORE),
    );
    // Un admin que ya edito el rol: no se le toca.
    const customized = JSON.stringify({
      ...defaultRolePayloads.member,
      task: ["read"],
    });
    const edited = await insertRole(workspace.id, "member", customized);
    const admin = await insertRole(
      workspace.id,
      "admin",
      JSON.stringify(defaultRolePayloads.admin),
    );
    // La API tolera un JSON mal formado; la migracion no puede romperse con el.
    const broken = await insertRole(workspace.id, "member", "not json");

    await runMemberCanAssignMigration();

    // Queda exactamente como lo sembraria hoy un espacio nuevo.
    expect(JSON.parse(await readPermission(untouched))).toEqual(
      defaultRolePayloads.member,
    );
    expect(await readPermission(edited)).toBe(customized);
    expect(JSON.parse(await readPermission(admin))).toEqual(
      defaultRolePayloads.admin,
    );
    expect(await readPermission(broken)).toBe("not json");
  });

  it("is idempotent", async () => {
    const { workspace } = await createWorkspaceMember();
    const id = await insertRole(
      workspace.id,
      "member",
      JSON.stringify(SEEDED_BEFORE),
    );

    await runMemberCanAssignMigration();
    const first = await readPermission(id);
    await runMemberCanAssignMigration();

    expect(await readPermission(id)).toBe(first);
    expect(JSON.parse(first).task).toEqual([
      "create",
      "read",
      "update",
      "assign",
    ]);
  });
});
