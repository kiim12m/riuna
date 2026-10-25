import { describe, expect, it } from "vitest";
import { getDatabasePool } from "../../apps/api/src/database";
import { withMigrationLock } from "../../apps/api/src/database/run-migrations";

// Auditoria 1.6: el `SET lock_timeout`, el cerrojo, las migraciones y el
// desbloqueo iban por el pool, y cada sentencia podia caer en una conexion
// distinta: el desbloqueo no soltaba nada y el limite no protegia a quien
// migraba.

async function heldBy() {
  const { rows } = await getDatabasePool().query<{ pid: number }>(
    "SELECT pid FROM pg_locks WHERE locktype = 'advisory' AND objid = 2051 AND granted",
  );
  return rows.map((row) => row.pid);
}

describe("withMigrationLock", () => {
  it("migrates on the session that holds the lock, with its lock timeout", async () => {
    let seen: { pid: number; lockTimeout: string } | undefined;

    await withMigrationLock(async (client) => {
      const { rows } = await client.query<{
        pid: number;
        lock_timeout: string;
      }>(
        "SELECT pg_backend_pid() AS pid, current_setting('lock_timeout') AS lock_timeout",
      );
      seen = {
        pid: rows[0]?.pid ?? -1,
        lockTimeout: rows[0]?.lock_timeout ?? "",
      };
      expect(await heldBy()).toEqual([seen.pid]);
    });

    expect(seen?.lockTimeout).toBe("30s");
    expect(await heldBy()).toEqual([]);
  });

  it("releases the lock when the migration fails", async () => {
    await expect(
      withMigrationLock(async () => {
        throw new Error("migracion rota");
      }),
    ).rejects.toThrow("migracion rota");

    expect(await heldBy()).toEqual([]);
  });
});
