import { afterEach, describe, expect, it, vi } from "vitest";
import type { BackupState } from "../../../apps/api/src/instance/backups";
import {
  findProblems,
  uncheckedKeys,
} from "../../../apps/api/src/instance/health";

const NOW = new Date("2026-10-11T12:00:00Z");
const hoursBefore = (h: number) =>
  new Date(NOW.getTime() - h * 3_600_000).toISOString();

function backups(overrides: Partial<BackupState> = {}): BackupState {
  return {
    configured: true,
    readable: true,
    latest: {
      file: "riuna_2026-10-11_030000.sql.gz",
      createdAt: hoursBefore(9),
      sizeBytes: 1000,
    },
    count: 3,
    offsite: null,
    ...overrides,
  };
}

const keys = (problems: { key: string }[]) => problems.map((p) => p.key);

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("findProblems (ADR 075)", () => {
  it("is quiet when everything is fine", () => {
    expect(findProblems({ backups: backups(), jobs: [], now: NOW })).toEqual(
      [],
    );
  });

  it("says nothing about backups it cannot see", () => {
    const problems = findProblems({
      backups: {
        configured: false,
        readable: false,
        latest: null,
        count: 0,
        offsite: null,
      },
      jobs: [],
      now: NOW,
    });

    expect(problems).toEqual([]);
  });

  // Revision de la Fase 9, hallazgo 6: antes un directorio ilegible contaba
  // como «no configurado», y la alerta de copias abierta se daba por resuelta.
  it("flags a backup directory it cannot read, and does not judge the backups in it", () => {
    const unreadable = backups({
      readable: false,
      latest: null,
      count: 0,
      offsite: null,
    });

    expect(
      keys(findProblems({ backups: unreadable, jobs: [], now: NOW })),
    ).toEqual(["backup.unreadable"]);
    expect(uncheckedKeys(unreadable)).toEqual([
      "backup.stale",
      "offsite.failing",
    ]);
    expect(uncheckedKeys(backups())).toEqual([]);
  });

  it("flags a local backup older than the interval plus two hours", () => {
    expect(
      keys(
        findProblems({
          backups: backups({
            latest: { file: "x", createdAt: hoursBefore(25), sizeBytes: 1 },
          }),
          jobs: [],
          now: NOW,
        }),
      ),
    ).toEqual([]);

    const problems = findProblems({
      backups: backups({
        latest: { file: "x", createdAt: hoursBefore(27), sizeBytes: 1 },
      }),
      jobs: [],
      now: NOW,
    });
    expect(keys(problems)).toEqual(["backup.stale"]);
    expect(problems[0]?.message).toContain("hace 27 h");
  });

  it("follows BACKUP_INTERVAL_HOURS", () => {
    vi.stubEnv("BACKUP_INTERVAL_HOURS", "6");

    const problems = findProblems({ backups: backups(), jobs: [], now: NOW });

    expect(keys(problems)).toEqual(["backup.stale"]);
  });

  it("flags an empty backup directory", () => {
    const problems = findProblems({
      backups: backups({ latest: null, count: 0 }),
      jobs: [],
      now: NOW,
    });

    expect(keys(problems)).toEqual(["backup.stale"]);
  });

  it("tolerates one failed offsite upload, not two", () => {
    const offsite = (lastSuccessHours: number) => ({
      status: "error",
      checkedAt: hoursBefore(0),
      lastSuccessAt: hoursBefore(lastSuccessHours),
      latest: null,
      remoteCount: 5,
      message: "rclone no ha podido subir",
    });

    expect(
      findProblems({
        backups: backups({ offsite: offsite(7) }),
        jobs: [],
        now: NOW,
      }),
    ).toEqual([]);
    const problems = findProblems({
      backups: backups({ offsite: offsite(14) }),
      jobs: [],
      now: NOW,
    });
    expect(keys(problems)).toEqual(["offsite.failing"]);
    expect(problems[0]?.message).toContain("rclone no ha podido subir");
  });

  it("flags an offsite copy that never worked", () => {
    const problems = findProblems({
      backups: backups({
        offsite: {
          status: "error",
          checkedAt: hoursBefore(0),
          lastSuccessAt: null,
          latest: null,
          remoteCount: null,
          message: "sin remoto",
        },
      }),
      jobs: [],
      now: NOW,
    });

    expect(keys(problems)).toEqual(["offsite.failing"]);
  });

  it("flags a job from its third failure in a row, one key per job", () => {
    const job = (name: string, failures: number) => ({
      job: name,
      lastStatus: "error",
      consecutiveFailures: failures,
      lastError: "boom",
    });

    const problems = findProblems({
      backups: backups(),
      jobs: [job("due-date-reminders", 2), job("automations", 3)],
      now: NOW,
    });

    expect(keys(problems)).toEqual(["job.failing:automations"]);
    expect(problems[0]?.message).toContain("3 veces seguidas");
  });
});
