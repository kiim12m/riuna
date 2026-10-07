import { and, eq, inArray, isNull } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import * as v from "valibot";
import db from "../database";
import { integrationTable, labelTable, teamTable } from "../database/schema";
import {
  type FieldDefinitionLike,
  FieldValidationError,
  resolveFieldValueChanges,
} from "../field/validate-field-values";
import { validateDiscordConfig } from "../plugins/discord/config";
import { assertPublicWebhookDestination } from "../plugins/generic-webhook/config";
import { validateSlackConfig } from "../plugins/slack/config";
import { telegramBotTokenSchema } from "../plugins/telegram/config";
import { filterAssignableUsers } from "../utils/assert-assignable-user";
import type { Action } from "./definition";

const invalid = (message: string) => new HTTPException(400, { message });

export type ActionScope = {
  workspaceId: string;
  projectId: string | null;
  columnIds: Set<string>;
  definitions: FieldDefinitionLike[];
};

export async function assertMembers(userIds: string[], workspaceId: string) {
  const unique = [...new Set(userIds)];
  const assignable = await filterAssignableUsers(unique, workspaceId);
  if (unique.some((userId) => !assignable.has(userId))) {
    throw invalid("Every person must be a member of this workspace");
  }
}

export async function assertTeam(teamId: string, workspaceId: string) {
  const [team] = await db
    .select({ id: teamTable.id })
    .from(teamTable)
    .where(
      and(eq(teamTable.id, teamId), eq(teamTable.workspaceId, workspaceId)),
    )
    .limit(1);
  if (!team) throw invalid("The team does not belong to this workspace");
}

// Lo que llega nuevo se comprueba con el validador de la integracion de ese
// canal; lo que se conserva cifrado ya se comprobo al guardarlo. Que el destino
// este completo se mira despues de fundir con lo guardado (`assertChatComplete`).
async function assertChatDestination(
  action: Extract<Action, { type: "chat" }>,
) {
  const { webhookUrl, botToken } = action.destination ?? {};
  let errors: string[] | undefined;

  if (action.channel === "telegram") {
    if (botToken !== undefined && botToken.trim() !== "") {
      const parsed = v.safeParse(telegramBotTokenSchema, botToken.trim());
      if (!parsed.success) errors = parsed.issues.map((issue) => issue.message);
    }
  } else if (webhookUrl !== undefined && webhookUrl.trim() !== "") {
    const validate =
      action.channel === "slack" ? validateSlackConfig : validateDiscordConfig;
    errors = (await validate({ webhookUrl: webhookUrl.trim() })).errors;
  }

  if (errors?.length) throw invalid(errors.join(", "));
}

/** Una regla de espacio sin destino guardado no tendria adonde escribir. */
export function assertChatComplete(actions: readonly Action[]) {
  for (const action of actions) {
    if (action.type !== "chat" || !action.destination) continue;
    const { webhookUrl, botToken, chatId } = action.destination;
    const complete =
      action.channel === "telegram"
        ? Boolean(botToken && chatId?.trim())
        : Boolean(webhookUrl);
    if (!complete)
      throw invalid(`The ${action.channel} destination is incomplete`);
  }
}

async function assertProjectChat(projectId: string, channel: string) {
  const [integration] = await db
    .select({ id: integrationTable.id })
    .from(integrationTable)
    .where(
      and(
        eq(integrationTable.projectId, projectId),
        eq(integrationTable.type, channel),
      ),
    )
    .limit(1);
  if (!integration) {
    throw invalid(`This project has no ${channel} integration to post to`);
  }
}

/** Comprueba que cada accion nombra cosas de su espacio y de su alcance. */
export async function validateActions(
  actions: readonly Action[],
  scope: ActionScope,
) {
  const labelIds = actions.flatMap((a) =>
    a.type === "label" ? [a.labelId] : [],
  );
  if (labelIds.length > 0) {
    const labels = await db
      .select({ id: labelTable.id })
      .from(labelTable)
      .where(
        and(
          inArray(labelTable.id, labelIds),
          eq(labelTable.workspaceId, scope.workspaceId),
          isNull(labelTable.taskId),
        ),
      );
    if (labels.length !== new Set(labelIds).size) {
      throw invalid("Labels must be workspace labels");
    }
  }

  for (const action of actions) {
    switch (action.type) {
      case "move":
        if (!scope.projectId) {
          throw invalid(
            "A workspace rule cannot move to a column: use complete",
          );
        }
        if (!scope.columnIds.has(action.columnId)) {
          throw invalid("The column does not belong to this project");
        }
        break;
      case "custom_field":
        try {
          resolveFieldValueChanges({
            definitions: scope.definitions,
            incoming: { [action.fieldKey]: action.value },
          });
        } catch (error) {
          if (error instanceof FieldValidationError)
            throw invalid(error.message);
          throw error;
        }
        break;
      case "assign_users":
        await assertMembers(action.userIds, scope.workspaceId);
        break;
      case "assign_team":
        if (action.teamId) await assertTeam(action.teamId, scope.workspaceId);
        break;
      case "create_task":
        await assertMembers(action.assigneeIds ?? [], scope.workspaceId);
        break;
      case "notify":
        await assertMembers(action.recipients.userIds ?? [], scope.workspaceId);
        break;
      case "webhook":
        try {
          await assertPublicWebhookDestination(action.url);
        } catch (error) {
          throw invalid(error instanceof Error ? error.message : "Invalid URL");
        }
        break;
      case "chat":
        if (scope.projectId) {
          if (action.destination) {
            throw invalid(
              "A project rule posts through the project integration",
            );
          }
          await assertProjectChat(scope.projectId, action.channel);
        } else {
          if (!action.destination) {
            throw invalid("A workspace rule needs a chat destination");
          }
          await assertChatDestination(action);
        }
        break;
    }
  }
}
