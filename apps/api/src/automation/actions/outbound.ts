import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import db from "../../database";
import {
  activityTable,
  integrationTable,
  teamMemberTable,
} from "../../database/schema";
import createNotification from "../../notification/controllers/create-notification";
import {
  postToDiscord,
  sanitizeDiscordContent,
} from "../../plugins/discord/client";
import { postToGenericWebhook } from "../../plugins/generic-webhook/client";
import { postToSlack } from "../../plugins/slack/client";
import { postToTelegram } from "../../plugins/telegram/client";
import { filterAssignableUsers } from "../../utils/assert-assignable-user";
import type { Action } from "../definition";
import { openSecret } from "../secrets";
import { renderTemplate, type TaskInfo } from "../task-info";
import { currentAssignees } from "./internal";
import type { ActionContext, ActionOutcome } from "./types";

type Notify = Extract<Action, { type: "notify" }>;
type Chat = Extract<Action, { type: "chat" }>;

async function creatorOf(taskId: string) {
  const [row] = await db
    .select({ userId: activityTable.userId })
    .from(activityTable)
    .where(
      and(
        eq(activityTable.taskId, taskId),
        inArray(activityTable.type, ["created", "create"]),
        isNotNull(activityTable.userId),
      ),
    )
    .orderBy(asc(activityTable.createdAt))
    .limit(1);
  return row?.userId ?? null;
}

async function resolveRecipients(
  recipients: Notify["recipients"],
  task: TaskInfo,
) {
  const ids = new Set(recipients.userIds ?? []);
  if (recipients.assignees) {
    for (const id of await currentAssignees(task.id)) ids.add(id);
  }
  if (recipients.creator) {
    const creator = await creatorOf(task.id);
    if (creator) ids.add(creator);
  }
  if (task.teamId && (recipients.teamMembers || recipients.teamLeads)) {
    const members = await db
      .select({
        userId: teamMemberTable.userId,
        isLead: teamMemberTable.isLead,
      })
      .from(teamMemberTable)
      .where(eq(teamMemberTable.teamId, task.teamId));
    for (const member of members) {
      if (recipients.teamMembers || member.isLead) ids.add(member.userId);
    }
  }
  // Quien ya no esta en el espacio no recibe nada de el.
  const members = await filterAssignableUsers([...ids], task.workspaceId);
  return [...ids].filter((id) => members.has(id));
}

async function notify(action: Notify, { rule, task }: ActionContext) {
  const recipients = await resolveRecipients(action.recipients, task);
  const content = renderTemplate(action.message, task);
  for (const userId of recipients) {
    await createNotification({
      userId,
      type: "automation",
      title: rule.name,
      content,
      eventData: {
        automationId: rule.id,
        taskTitle: task.title,
        projectId: task.projectId,
        workspaceId: task.workspaceId,
      },
      resourceId: task.id,
      resourceType: "task",
    });
  }
  return { recipients: recipients.length };
}

/** La forma de tarea del webhook generico, mas su clave. */
function webhookTask(task: TaskInfo) {
  return {
    id: task.id,
    key: task.key,
    title: task.title,
    number: task.number,
    status: task.status,
    statusName: task.statusName,
    priority: task.priority,
    projectId: task.projectId,
    projectName: task.projectName,
    workspaceId: task.workspaceId,
    taskUrl: task.taskUrl,
  };
}

async function projectChat(projectId: string, channel: Chat["channel"]) {
  const [integration] = await db
    .select({
      config: integrationTable.config,
      isActive: integrationTable.isActive,
    })
    .from(integrationTable)
    .where(
      and(
        eq(integrationTable.projectId, projectId),
        eq(integrationTable.type, channel),
      ),
    )
    .limit(1);
  if (!integration || integration.isActive === false) {
    throw new Error(`This project has no active ${channel} integration`);
  }
  return JSON.parse(integration.config) as Record<string, unknown>;
}

async function chat(action: Chat, { rule, task }: ActionContext) {
  // Regla de proyecto: la integracion del proyecto. De espacio: su destino,
  // guardado cifrado en la propia regla.
  const destination = rule.projectId
    ? await projectChat(task.projectId, action.channel)
    : {
        webhookUrl: openSecret(action.destination?.webhookUrl),
        botToken: openSecret(action.destination?.botToken),
        chatId: action.destination?.chatId,
        threadId: action.destination?.threadId,
      };
  const text = renderTemplate(action.message, task);

  if (action.channel === "telegram") {
    const { botToken, chatId, threadId } = destination;
    if (typeof botToken !== "string" || typeof chatId !== "string") {
      throw new Error("The telegram destination is incomplete");
    }
    await postToTelegram(botToken, {
      chat_id: chatId,
      text,
      ...(typeof threadId === "number" ? { message_thread_id: threadId } : {}),
    });
    return { channel: action.channel };
  }

  const { webhookUrl } = destination;
  if (typeof webhookUrl !== "string") {
    throw new Error(`The ${action.channel} destination is incomplete`);
  }
  if (action.channel === "slack") {
    await postToSlack(webhookUrl, { text });
  } else {
    await postToDiscord(webhookUrl, { content: sanitizeDiscordContent(text) });
  }
  return { channel: action.channel };
}

export async function runOutboundAction(
  action: Extract<Action, { type: "notify" | "webhook" | "chat" }>,
  context: ActionContext,
): Promise<ActionOutcome> {
  switch (action.type) {
    case "notify":
      return notify(action, context);
    case "webhook":
      await postToGenericWebhook(
        action.url,
        {
          event: "automation.fired",
          automation: { id: context.rule.id, name: context.rule.name },
          trigger: context.eventType,
          task: webhookTask(context.task),
          timestamp: new Date().toISOString(),
        },
        openSecret(action.secret),
      );
      return { url: action.url };
    case "chat":
      return chat(action, context);
  }
}
