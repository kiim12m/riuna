import { mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { checkInstanceHealth } from "../../apps/api/src/instance/alerts";
import { withCheckIn } from "../../apps/api/src/scheduler";
import { log } from "../../apps/api/src/utils/log";
import { createApiKey, mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { createWorkspaceMember } from "./helpers/fixtures";

// El estado de la instancia y sus alertas (ADR 075).

let backupDir = "";

beforeEach(async () => {
  await resetTestDatabase();
  backupDir = await mkdtemp(join(tmpdir(), "riuna-backups-"));
  vi.stubEnv("BACKUP_DIR", backupDir);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(backupDir, { recursive: true, force: true });
});

async function instanceAdmin() {
  const member = await createWorkspaceMember();
  await db
    .update(schema.userTable)
    .set({ role: "admin" })
    .where(eq(schema.userTable.id, member.user.id));
  return member.user;
}

async function writeBackup(name: string, hoursAgo: number) {
  const file = join(backupDir, name);
  await writeFile(file, "copia");
  const when = new Date(Date.now() - hoursAgo * 3_600_000);
  await utimes(file, when, when);
}

const alertsFor = (userId: string) =>
  db
    .select()
    .from(schema.notificationTable)
    .where(
      and(
        eq(schema.notificationTable.userId, userId),
        eq(schema.notificationTable.type, "instance_alert"),
      ),
    );

// Un trabajo que falla, tres veces, por el mismo envoltorio que usa el
// planificador.
async function failThreeTimes(job: string) {
  vi.spyOn(log, "error").mockImplementation(() => {});
  const run = withCheckIn(job, async () => {
    throw new Error("se cayo https://hooks.example.com/x?token=secreto");
  });
  for (let i = 0; i < 3; i += 1) await run();
}

describe("instance report", () => {
  it("is only for the instance admin", async () => {
    const member = await createWorkspaceMember();
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request("/api/instance/report");

    expect(response.status).toBe(403);
  });

  it("refuses an API key, even the instance admin's", async () => {
    const admin = await instanceAdmin();
    const key = await createApiKey(admin.id);
    const { app } = createApp();

    const response = await app.request("/api/instance/report", {
      headers: { "x-api-key": key },
    });

    expect(response.status).toBe(403);
  });

  it("tells the admin about the database, jobs, backups and what is wrong", async () => {
    const admin = await instanceAdmin();
    await writeBackup("riuna_2026-10-10_030000.sql.gz", 30);
    await writeFile(
      join(backupDir, ".offsite-status.json"),
      JSON.stringify({
        status: "ok",
        checkedAt: new Date().toISOString(),
        lastSuccessAt: new Date().toISOString(),
        latest: "riuna_2026-10-10_030000.sql.gz",
        remoteCount: 4,
        message: null,
      }),
    );
    await failThreeTimes("due-date-reminders");
    mockAuthenticatedSession(admin);
    const { app } = createApp();

    const response = await app.request("/api/instance/report");

    expect(response.status).toBe(200);
    const report = await response.json();
    expect(report.database.sizeBytes).toBeGreaterThan(0);
    expect(report.database.appliedMigrations).toBe(
      report.database.bundledMigrations,
    );
    expect(report.backups).toMatchObject({
      configured: true,
      count: 1,
      latest: { file: "riuna_2026-10-10_030000.sql.gz" },
      offsite: { status: "ok", remoteCount: 4 },
    });
    expect(report.jobs).toEqual([
      expect.objectContaining({
        job: "due-date-reminders",
        lastStatus: "error",
        consecutiveFailures: 3,
        lastSuccessAt: null,
      }),
    ]);
    // La consulta de la URL del error no sale: podia llevar un token.
    expect(JSON.stringify(report)).not.toContain("secreto");
    expect(report.problems.map((p: { key: string }) => p.key).sort()).toEqual([
      "backup.stale",
      "job.failing:due-date-reminders",
    ]);
  });
});

describe("job status", () => {
  it("counts failures in a row and resets them on the next good run", async () => {
    await failThreeTimes("automations");
    await withCheckIn("automations", async () => ({ degraded: false }))();

    const [row] = await db
      .select()
      .from(schema.jobStatusTable)
      .where(eq(schema.jobStatusTable.job, "automations"));
    expect(row).toMatchObject({
      lastStatus: "ok",
      consecutiveFailures: 0,
      lastError: null,
    });
    expect(row?.lastSuccessAt).toBeInstanceOf(Date);
  });
});

describe("instance alerts", () => {
  it("opens one alert per problem, tells the admin once, and closes it when it goes away", async () => {
    const admin = await instanceAdmin();
    const bystander = await createWorkspaceMember();
    await writeBackup("riuna_2026-10-11_030000.sql.gz", 1);
    await failThreeTimes("recurring-tasks");

    const first = await checkInstanceHealth();
    const second = await checkInstanceHealth();

    expect(first).toMatchObject({ opened: 1, resolved: 0 });
    expect(second).toMatchObject({ opened: 0, resolved: 0 });
    const opened = await alertsFor(admin.id);
    expect(opened).toHaveLength(1);
    expect(opened[0]?.content).toContain("recurring-tasks");
    expect(await alertsFor(bystander.user.id)).toHaveLength(0);

    await withCheckIn("recurring-tasks", async () => ({ degraded: false }))();
    const third = await checkInstanceHealth();

    expect(third).toMatchObject({ opened: 0, resolved: 1 });
    const all = await alertsFor(admin.id);
    expect(all).toHaveLength(2);
    expect(all.map((n) => n.title)).toContain("Riuna · resuelto");
    const [alert] = await db.select().from(schema.instanceAlertTable);
    expect(alert?.resolvedAt).toBeInstanceOf(Date);
  });

  it("does not alert about backups it cannot see", async () => {
    await instanceAdmin();
    vi.stubEnv("BACKUP_DIR", "");

    expect(await checkInstanceHealth()).toMatchObject({ opened: 0 });
  });
});
