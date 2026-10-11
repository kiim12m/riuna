import { and, eq, gte, inArray, isNull, lt, ne, sql } from "drizzle-orm";
import db from "../database";
import {
  automationRunTable,
  automationTable,
  projectTable,
  taskReminderSentTable,
  taskTable,
} from "../database/schema";
import { getFieldDefinitionsForProject } from "../field/controllers/get-field-definitions";
import { addDays, startOfServerDay } from "../utils/day-boundaries";
import { log } from "../utils/log";
import { buildFilter } from "../view/build-filter";
import { buildFieldRegistry } from "../view/field-registry";
import type { EditableCondition } from "../view/filter-schema";
import { filterToSql } from "../view/filter-to-sql";
import { getWorkspaceFieldRegistry } from "../view/workspace-registry";
import { DATE_TRIGGERS, type Trigger } from "./definition";
import { ruleActorCanRun } from "./permissions";
import { executeRule, pauseRule, recordRun } from "./run";
import { sendScheduledStandup } from "./standup";
import { loadTaskInfo } from "./task-info";

type AutomationRow = typeof automationTable.$inferSelect;

/** Tareas por regla y vuelta: lo que no quepa sale en la siguiente. */
const DATE_BATCH = 200;
/** «Vencida» avisa al vencer, no de lo que ya llevaba una semana vencido. */
const OVERDUE_LOOKBACK_DAYS = 7;
const RUN_RETENTION_DAYS = 30;

const activeRules = (types: readonly string[]) =>
  db
    .select()
    .from(automationTable)
    .where(
      and(
        inArray(automationTable.triggerType, [...types]),
        eq(automationTable.enabled, true),
        isNull(automationTable.archivedAt),
      ),
    );

async function compiledConditions(rule: AutomationRow) {
  const filter = buildFilter((rule.conditions ?? []) as EditableCondition[]);
  if (!filter) return null;
  const registry = rule.projectId
    ? buildFieldRegistry(
        await getFieldDefinitionsForProject(
          rule.workspaceId,
          rule.projectId,
          true,
        ),
      )
    : await getWorkspaceFieldRegistry(rule.workspaceId);
  return filterToSql(filter, registry);
}

/**
 * Las tareas a las que les toca un disparador por fecha ahora, con las mismas
 * fronteras de dia que el resto de la aplicacion (`utils/due-window.ts`): una
 * tarea vence a lo largo de su dia, y esta vencida desde el siguiente.
 */
async function dueTasks(rule: AutomationRow, now: Date) {
  const trigger = { ...rule.triggerConfig, type: rule.triggerType } as Trigger;
  const today = startOfServerDay(now);
  const window =
    trigger.type === "task.due_in"
      ? and(
          gte(taskTable.dueDate, today),
          lt(taskTable.dueDate, addDays(today, trigger.days + 1)),
        )
      : and(
          gte(taskTable.dueDate, addDays(today, -OVERDUE_LOOKBACK_DAYS)),
          lt(taskTable.dueDate, today),
        );
  const key = `automation:${rule.id}`;

  return db
    .select({ id: taskTable.id })
    .from(taskTable)
    .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .where(
      and(
        window,
        rule.projectId
          ? eq(taskTable.projectId, rule.projectId)
          : and(
              eq(projectTable.workspaceId, rule.workspaceId),
              isNull(projectTable.ownerUserId),
            ),
        isNull(projectTable.archivedAt),
        // "Hecha" es `completed_at` (ADR 030), y lo archivado tampoco cuenta.
        isNull(taskTable.completedAt),
        ne(taskTable.status, "archived"),
        sql`NOT EXISTS (SELECT 1 FROM ${taskReminderSentTable} WHERE ${taskReminderSentTable.taskId} = ${taskTable.id} AND ${taskReminderSentTable.reminderType} = ${key})`,
        (await compiledConditions(rule)) ?? undefined,
      ),
    )
    .limit(DATE_BATCH);
}

/**
 * «Ya disparado» en `task_reminder_sent`, que el disparador de la 0069 vacia
 * al cambiar el vencimiento: mover la fecha rearma la regla. Se apunta antes
 * de actuar, asi que dos vueltas a la vez no actuan dos veces.
 */
async function claim(ruleId: string, taskId: string) {
  const claimed = await db
    .insert(taskReminderSentTable)
    .values({ taskId, reminderType: `automation:${ruleId}` })
    .onConflictDoNothing()
    .returning({ id: taskReminderSentTable.id });
  return claimed.length > 0;
}

async function runDateRule(rule: AutomationRow, now: Date) {
  if (!rule.updatedBy || !(await ruleActorCanRun(rule))) {
    await pauseRule(rule, "actor_lost_permission");
    await recordRun({
      rule,
      taskId: null,
      status: "skipped",
      detail: { reason: "actor_lost_permission" },
    });
    return;
  }

  let tasks: { id: string }[];
  try {
    tasks = await dueTasks(rule, now);
  } catch (error) {
    await recordRun({
      rule,
      taskId: null,
      status: "failed",
      detail: {
        error: `condition: ${error instanceof Error ? error.message : error}`,
      },
    });
    return;
  }

  for (const { id } of tasks) {
    if (!(await claim(rule.id, id))) continue;
    const task = await loadTaskInfo(id);
    if (!task) continue;
    await executeRule({
      rule,
      task,
      actorId: rule.updatedBy,
      chain: [],
      eventType: rule.triggerType,
    });
  }
}

/**
 * Lo que el planificador mira cada cinco minutos: los disparadores por fecha,
 * los envios programados del stand-up y, una vez por hora, la purga del
 * historial. Corre con arrendamiento: con varias instancias, solo una.
 */
export async function checkAutomations(now = new Date()) {
  let degraded = false;

  for (const rule of await activeRules(DATE_TRIGGERS)) {
    try {
      await runDateRule(rule, now);
    } catch (error) {
      degraded = true;
      log.error(`Automation ${rule.id} failed on its date check:`, error);
    }
  }

  for (const rule of await activeRules(["schedule"])) {
    try {
      await sendScheduledStandup(rule, now);
    } catch (error) {
      degraded = true;
      log.error(`Automation ${rule.id} failed to send its stand-up:`, error);
    }
  }

  if (now.getMinutes() < 5) {
    await db
      .delete(automationRunTable)
      .where(
        lt(automationRunTable.startedAt, addDays(now, -RUN_RETENTION_DAYS)),
      );
  }

  return { degraded };
}
