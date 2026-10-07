import type { automationTable } from "../database/schema";
import type { StoredAction } from "./secrets";
import { publicActions } from "./secrets";

type AutomationRow = typeof automationTable.$inferSelect;

export type LastRun = { status: string; startedAt: Date } | null;

/** Una regla como sale por la API: el disparador entero y sin secretos. */
export function toPublicAutomation(
  row: AutomationRow,
  lastRun: LastRun = null,
) {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    teamId: row.teamId,
    name: row.name,
    enabled: row.enabled,
    trigger: { ...row.triggerConfig, type: row.triggerType },
    conditions: row.conditions,
    actions: publicActions(row.actions as StoredAction[]),
    pausedReason: row.pausedReason,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastRun,
  };
}

/** Lo que la tabla guarda de un disparador: el tipo en su columna, el resto aparte. */
export function splitTrigger(
  trigger: { type: string } & Record<string, unknown>,
) {
  const { type, ...config } = trigger;
  return { triggerType: type, triggerConfig: config };
}
