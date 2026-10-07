import { eq } from "drizzle-orm";
import db from "../../database";
import { automationTable } from "../../database/schema";
import type { AutomationInput } from "../definition";
import { type StoredAction, sealActions } from "../secrets";
import { splitTrigger, toPublicAutomation } from "../serialize";
import { assertChatComplete } from "../validate-actions";
import { validateAutomation } from "../validate-automation";

type AutomationRow = typeof automationTable.$inferSelect;

export async function createAutomation({
  workspaceId,
  projectId,
  input,
  currentUserId,
}: {
  workspaceId: string;
  projectId: string | null;
  input: AutomationInput;
  currentUserId: string;
}) {
  await validateAutomation({ workspaceId, projectId, input });
  const actions = sealActions(input.actions);
  assertChatComplete(actions);

  const [row] = await db
    .insert(automationTable)
    .values({
      workspaceId,
      projectId,
      teamId: input.teamId ?? null,
      name: input.name,
      enabled: input.enabled ?? true,
      ...splitTrigger(input.trigger),
      conditions: input.conditions ?? [],
      actions,
      createdBy: currentUserId,
      updatedBy: currentUserId,
    })
    .returning();

  if (!row) throw new Error("Failed to create automation");
  return toPublicAutomation(row);
}

/**
 * Guardar una regla la pone a nombre de quien la guarda (ADR 067): desde ese
 * momento actua con sus permisos, y si estaba pausada porque quien la guardo
 * antes los perdio, vuelve a correr.
 */
export async function updateAutomation({
  automation,
  input,
  currentUserId,
}: {
  automation: AutomationRow;
  input: AutomationInput;
  currentUserId: string;
}) {
  await validateAutomation({
    workspaceId: automation.workspaceId,
    projectId: automation.projectId,
    input,
  });
  const actions = sealActions(
    input.actions,
    automation.actions as StoredAction[],
  );
  assertChatComplete(actions);

  const [row] = await db
    .update(automationTable)
    .set({
      name: input.name,
      teamId: input.teamId ?? null,
      enabled: input.enabled ?? automation.enabled,
      ...splitTrigger(input.trigger),
      conditions: input.conditions ?? [],
      actions,
      pausedReason: null,
      updatedBy: currentUserId,
    })
    .where(eq(automationTable.id, automation.id))
    .returning();

  if (!row) throw new Error("Failed to update automation");
  return toPublicAutomation(row);
}

export async function setAutomationEnabled({
  automation,
  enabled,
  currentUserId,
}: {
  automation: AutomationRow;
  enabled: boolean;
  currentUserId: string;
}) {
  const [row] = await db
    .update(automationTable)
    .set(
      enabled
        ? { enabled, pausedReason: null, updatedBy: currentUserId }
        : { enabled },
    )
    .where(eq(automationTable.id, automation.id))
    .returning();

  if (!row) throw new Error("Failed to update automation");
  return toPublicAutomation(row);
}

/** Archivar, no borrar: el historial de lo que hizo sigue ahi. */
export async function archiveAutomation(automation: AutomationRow) {
  await db
    .update(automationTable)
    .set({ archivedAt: new Date(), enabled: false })
    .where(eq(automationTable.id, automation.id));
  return { id: automation.id };
}
