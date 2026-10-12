import { and, eq, isNull } from "drizzle-orm";
import db from "../database";
import {
  instanceAlertTable,
  jobStatusTable,
  userTable,
} from "../database/schema";
import createNotification from "../notification/controllers/create-notification";
import { log } from "../utils/log";
import { readBackupState } from "./backups";
import { findProblems, uncheckedKeys } from "./health";

async function instanceAdmins() {
  const rows = await db
    .select({ id: userTable.id, banned: userTable.banned })
    .from(userTable)
    .where(eq(userTable.role, "admin"));
  return rows.filter((row) => !row.banned).map((row) => row.id);
}

async function notifyAdmins(title: string, content: string, key: string) {
  const admins = await instanceAdmins();
  for (const userId of admins) {
    try {
      await createNotification({
        userId,
        type: "instance_alert",
        title,
        content,
        eventData: { key },
      });
    } catch (error) {
      log.error("Could not deliver an instance alert", error, { key, userId });
    }
  }
  return admins.length;
}

/**
 * El trabajo `instance-health` (ADR 075): abre una alerta por cada problema
 * nuevo y cierra las que ya no lo son, y avisa de las dos cosas al admin de
 * instancia por sus canales. Una alerta abierta no se repite: la clave tiene un
 * índice único mientras no se cierra.
 */
export async function checkInstanceHealth() {
  const [backups, jobs, open] = await Promise.all([
    readBackupState(),
    db.select().from(jobStatusTable),
    db
      .select()
      .from(instanceAlertTable)
      .where(isNull(instanceAlertTable.resolvedAt)),
  ]);
  const problems = findProblems({ backups, jobs });
  let opened = 0;
  let resolved = 0;

  for (const problem of problems) {
    if (open.some((alert) => alert.key === problem.key)) continue;
    const [created] = await db
      .insert(instanceAlertTable)
      .values({ key: problem.key, message: problem.message })
      .onConflictDoNothing()
      .returning();
    if (!created) continue;
    opened += 1;
    await notifyAdmins(
      `Riuna · ${problem.label}`,
      problem.message,
      problem.key,
    );
  }

  const unchecked = new Set(uncheckedKeys(backups));
  for (const alert of open) {
    if (unchecked.has(alert.key)) continue;
    const still = problems.find((problem) => problem.key === alert.key);
    if (still) continue;
    const [closed] = await db
      .update(instanceAlertTable)
      .set({ resolvedAt: new Date() })
      .where(
        and(
          eq(instanceAlertTable.id, alert.id),
          isNull(instanceAlertTable.resolvedAt),
        ),
      )
      .returning();
    if (!closed) continue;
    resolved += 1;
    await notifyAdmins(
      "Riuna · resuelto",
      `Resuelto: ${alert.message}`,
      alert.key,
    );
  }

  if (opened > 0 || resolved > 0) {
    log.info("Instance alerts updated", { opened, resolved });
  }
  return { degraded: false, opened, resolved };
}
