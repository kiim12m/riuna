import { and, asc, eq, isNull, or } from "drizzle-orm";
import db from "../database";
import { automationTable, columnTable, projectTable } from "../database/schema";
import { subscribeToEvent } from "../events";
import type { EditableCondition } from "../view/filter-schema";
import { taskMatchesConditions } from "./condition";
import type { Trigger, TriggerType } from "./definition";
import { ruleActorCanRun } from "./permissions";
import { executeRule, pauseRule, recordRun } from "./run";
import { loadTaskInfo, type TaskInfo } from "./task-info";
import { EVENT_TRIGGERS, matchesTrigger, type StatusMove } from "./triggers";

// El motor de automatizaciones (ADR 067): un suscriptor mas del bus, como la
// actividad o los avisos. Cada evento busca sus reglas en una consulta —sin
// cache, que con varias replicas se quedaria vieja— y las corre en orden.

type AutomationRow = typeof automationTable.$inferSelect;
type EventData = Record<string, unknown>;

/** Una regla que ya esta en la cadena, o una cadena de tres, no corre. */
const MAX_CHAIN = 3;

/**
 * Las reglas activas que pueden responder: las del proyecto y las del
 * espacio, salvo en un proyecto «Personal» o archivado. Va por el indice
 * parcial `(workspace_id, trigger_type)`.
 */
function candidateRules(projectId: string, triggerType: TriggerType) {
  return db
    .select({ rule: automationTable })
    .from(automationTable)
    .innerJoin(
      projectTable,
      and(
        eq(projectTable.id, projectId),
        eq(projectTable.workspaceId, automationTable.workspaceId),
      ),
    )
    .where(
      and(
        eq(automationTable.triggerType, triggerType),
        eq(automationTable.enabled, true),
        isNull(automationTable.archivedAt),
        isNull(projectTable.archivedAt),
        or(
          eq(automationTable.projectId, projectTable.id),
          and(
            isNull(automationTable.projectId),
            isNull(projectTable.ownerUserId),
          ),
        ),
      ),
    )
    .orderBy(asc(automationTable.createdAt))
    .then((rows) => rows.map((row) => row.rule));
}

async function resolveMove(
  task: TaskInfo,
  data: EventData,
): Promise<StatusMove> {
  const columns = await db
    .select({
      id: columnTable.id,
      slug: columnTable.slug,
      isFinal: columnTable.isFinal,
    })
    .from(columnTable)
    .where(eq(columnTable.projectId, task.projectId));
  const bySlug = new Map(columns.map((column) => [column.slug, column]));
  const to = bySlug.get(String(data.newStatus));
  return {
    fromColumnId: bySlug.get(String(data.oldStatus))?.id ?? null,
    toColumnId: to?.id ?? null,
    toFinal: Boolean(to?.isFinal),
  };
}

function chainOf(data: EventData): string[] {
  const automation = data.automation as { chain?: unknown } | undefined;
  return Array.isArray(automation?.chain)
    ? automation.chain.filter((id): id is string => typeof id === "string")
    : [];
}

async function considerRule({
  rule,
  task,
  eventType,
  data,
  move,
  chain,
}: {
  rule: AutomationRow;
  task: TaskInfo;
  eventType: string;
  data: EventData;
  move: StatusMove | undefined;
  chain: string[];
}) {
  const trigger = { ...rule.triggerConfig, type: rule.triggerType } as Trigger;
  if (!matchesTrigger(trigger, eventType, data, move)) return;

  if (chain.includes(rule.id) || chain.length >= MAX_CHAIN) {
    await recordRun({
      rule,
      taskId: task.id,
      status: "skipped",
      detail: { event: eventType, reason: "loop", chain },
    });
    return;
  }

  // Actua en nombre de quien la guardo, que tiene que seguir pudiendo.
  const actorId = rule.updatedBy;
  if (!actorId || !(await ruleActorCanRun(rule))) {
    await pauseRule(rule, "actor_lost_permission");
    await recordRun({
      rule,
      taskId: task.id,
      status: "skipped",
      detail: { event: eventType, reason: "actor_lost_permission" },
    });
    return;
  }

  try {
    const matches = await taskMatchesConditions({
      taskId: task.id,
      workspaceId: rule.workspaceId,
      projectId: rule.projectId,
      conditions: rule.conditions as EditableCondition[],
    });
    if (!matches) return;
  } catch (error) {
    await recordRun({
      rule,
      taskId: task.id,
      status: "failed",
      detail: {
        event: eventType,
        error: `condition: ${error instanceof Error ? error.message : error}`,
      },
    });
    return;
  }

  await executeRule({
    rule,
    task,
    actorId,
    chain: [...chain, rule.id],
    eventType,
  });
}

export async function handleAutomationEvent(
  eventType: string,
  data: EventData,
) {
  const triggerType = EVENT_TRIGGERS[eventType];
  if (!triggerType) return;
  // Lo importado no son decisiones de nadie, y lo que arrastra una cascada es
  // consecuencia de algo a lo que ya se respondio.
  if (data.origin === "import" || data.cascadedFrom) return;

  const taskId = typeof data.taskId === "string" ? data.taskId : null;
  const projectId = typeof data.projectId === "string" ? data.projectId : null;
  if (!taskId || !projectId) return;

  const rules = await candidateRules(projectId, triggerType);
  if (rules.length === 0) return;

  const task = await loadTaskInfo(taskId);
  if (!task || task.projectId !== projectId) return;

  const move =
    triggerType === "task.status_changed"
      ? await resolveMove(task, data)
      : undefined;
  const chain = chainOf(data);

  for (const rule of rules) {
    try {
      await considerRule({ rule, task, eventType, data, move, chain });
    } catch (error) {
      console.error(`Automation ${rule.id} failed on ${eventType}:`, error);
    }
  }
}

for (const eventType of Object.keys(EVENT_TRIGGERS)) {
  void subscribeToEvent<EventData>(eventType, (data) =>
    handleAutomationEvent(eventType, data),
  );
}
