import { eq } from "drizzle-orm";
import db from "../database";
import { automationRunTable, automationTable } from "../database/schema";
import { eventContext } from "../events";
import { runAction } from "./actions";
import type { Action } from "./definition";
import { loadTaskInfo, type TaskInfo } from "./task-info";

type AutomationRow = typeof automationTable.$inferSelect;

export type RunStatus = "ok" | "failed" | "skipped";

export async function recordRun({
  rule,
  taskId,
  status,
  detail,
  startedAt = new Date(),
}: {
  rule: AutomationRow;
  taskId: string | null;
  status: RunStatus;
  detail: Record<string, unknown>;
  startedAt?: Date;
}) {
  await db.insert(automationRunTable).values({
    automationId: rule.id,
    taskId,
    triggerType: rule.triggerType,
    status,
    detail,
    startedAt,
    durationMs: Date.now() - startedAt.getTime(),
  });
}

/** Una regla que ya no puede correr se para sola y dice por que. */
export async function pauseRule(rule: AutomationRow, reason: string) {
  await db
    .update(automationTable)
    .set({ enabled: false, pausedReason: reason })
    .where(eq(automationTable.id, rule.id));
}

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/**
 * Las acciones de una regla, en orden y en nombre de `actorId`. Corren con el
 * contexto de la regla (ADR 067): lo que publiquen lleva la cadena que corta
 * los bucles y la actividad las nombra a ellas. Si una falla, las siguientes no
 * corren: «mueve y despues avisa» no debe avisar de algo que no paso.
 */
export async function executeRule({
  rule,
  task,
  actorId,
  chain,
  eventType,
}: {
  rule: AutomationRow;
  task: TaskInfo;
  actorId: string;
  chain: string[];
  eventType: string;
}) {
  const startedAt = new Date();
  const results: Record<string, unknown>[] = [];
  let status: RunStatus = "ok";

  await eventContext.run(
    {
      initiatorId: `automation:${rule.id}`,
      automation: { id: rule.id, name: rule.name, chain },
    },
    async () => {
      let current = task;
      for (const action of rule.actions as Action[]) {
        try {
          const outcome = await runAction(action, {
            rule,
            task: current,
            actorId,
            eventType,
          });
          // La siguiente ve la tarea como la dejo esta: «mueve y avisa» avisa
          // con la columna nueva en `{estado}`.
          current = (await loadTaskInfo(task.id)) ?? current;
          results.push({
            id: action.id,
            type: action.type,
            status: "ok",
            ...outcome,
          });
        } catch (error) {
          status = "failed";
          results.push({
            id: action.id,
            type: action.type,
            status: "failed",
            error: messageOf(error),
          });
          break;
        }
      }
    },
  );

  await recordRun({
    rule,
    taskId: task.id,
    status,
    detail: { event: eventType, actions: results },
    startedAt,
  });
}
