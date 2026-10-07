import { client } from "@riuna/libs";
import { HttpError } from "@/lib/http-error";
import type { EditableCondition } from "@/types/task-filter";

// El espejo en el web de `apps/api/src/automation/definition.ts` (ADR 066).
// La API lo valida con Valibot y devuelve un 400 si divergen.

export type Priority = "no-priority" | "low" | "medium" | "high" | "urgent";
export type ChatChannel = "slack" | "discord" | "telegram";

export type Trigger =
  | { type: "task.created" }
  | {
      type: "task.status_changed";
      fromColumnId?: string;
      toColumnId?: string;
      toFinal?: boolean;
    }
  | { type: "task.assigned"; userId?: string; teamId?: string }
  | { type: "task.priority_changed"; to?: Priority }
  | { type: "task.field_changed"; fieldKey?: string }
  | { type: "task.commented" }
  | { type: "task.labeled"; labelName?: string }
  | { type: "task.due_in"; days: number }
  | { type: "task.overdue" }
  | { type: "schedule"; weekdays: number[]; time: string };

export type TriggerType = Trigger["type"];

/**
 * Un destino de chat tal como se edita: lo secreto (la URL del webhook, el
 * token del bot) solo se manda si se ha escrito; la API dice si ya hay uno.
 */
export type ChatDestination = {
  webhookUrl?: string;
  botToken?: string;
  chatId?: string;
  threadId?: number;
  hasWebhookUrl?: boolean;
  hasBotToken?: boolean;
};

export type Action = { id: string } & (
  | { type: "move"; columnId: string }
  | { type: "complete"; done: boolean }
  | { type: "priority"; priority: Priority }
  | { type: "due_date"; days: number | null }
  | { type: "custom_field"; fieldKey: string; value: unknown }
  | { type: "label"; labelId: string }
  | {
      type: "assign_users";
      mode: "add" | "replace" | "remove";
      userIds: string[];
    }
  | { type: "assign_team"; teamId: string | null }
  | {
      type: "create_task";
      title: string;
      asSubtask: boolean;
      assigneeIds?: string[];
    }
  | {
      type: "notify";
      recipients: {
        assignees?: boolean;
        creator?: boolean;
        teamMembers?: boolean;
        teamLeads?: boolean;
        userIds?: string[];
      };
      message: string;
    }
  | { type: "webhook"; url: string; secret?: string; hasSecret?: boolean }
  | {
      type: "chat";
      channel: ChatChannel;
      message: string;
      destination?: ChatDestination;
    }
  | { type: "standup"; channel: ChatChannel; destination: ChatDestination }
);

export type ActionType = Action["type"];

export type Automation = {
  id: string;
  workspaceId: string;
  projectId: string | null;
  teamId: string | null;
  name: string;
  enabled: boolean;
  trigger: Trigger;
  conditions: EditableCondition[];
  actions: Action[];
  pausedReason: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
  lastRun: { status: RunStatus; startedAt: string } | null;
};

export type AutomationInput = {
  name: string;
  enabled?: boolean;
  trigger: Trigger;
  teamId?: string;
  conditions?: EditableCondition[];
  actions: Action[];
};

export type RunStatus = "ok" | "failed" | "skipped";

export type AutomationRun = {
  id: string;
  taskId: string | null;
  taskTitle: string | null;
  taskNumber: number | null;
  triggerType: string;
  status: RunStatus;
  detail: {
    event?: string;
    reason?: string;
    error?: string;
    actions?: Array<{
      id: string;
      type: ActionType;
      status: "ok" | "failed";
      error?: string;
      unchanged?: boolean;
    }>;
  };
  startedAt: string;
  durationMs: number;
};

/** Donde vive una regla: un proyecto, el espacio o los envios de un equipo. */
export type AutomationScope =
  | { kind: "project"; projectId: string }
  | { kind: "workspace"; workspaceId: string }
  | { kind: "team"; workspaceId: string; teamId: string };

async function unwrap<T>(response: {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
  json: () => Promise<T>;
}) {
  if (!response.ok) {
    throw new HttpError(await response.text(), response.status);
  }
  return response.json();
}

export async function getAutomations(
  scope: AutomationScope,
): Promise<Automation[]> {
  const api = client.automation;
  const response =
    scope.kind === "project"
      ? await api.project[":projectId"].$get({
          param: { projectId: scope.projectId },
        })
      : scope.kind === "workspace"
        ? await api.workspace[":workspaceId"].$get({
            param: { workspaceId: scope.workspaceId },
          })
        : await api.workspace[":workspaceId"].team[":teamId"].$get({
            param: { workspaceId: scope.workspaceId, teamId: scope.teamId },
          });
  return (await unwrap(response)) as unknown as Automation[];
}

export async function createAutomation(
  scope: AutomationScope,
  input: AutomationInput,
): Promise<Automation> {
  const api = client.automation;
  const response =
    scope.kind === "project"
      ? await api.project[":projectId"].$post({
          param: { projectId: scope.projectId },
          json: input as never,
        })
      : await api.workspace[":workspaceId"].$post({
          param: { workspaceId: scope.workspaceId },
          json: input as never,
        });
  return (await unwrap(response)) as unknown as Automation;
}

export async function updateAutomation(
  id: string,
  input: AutomationInput,
): Promise<Automation> {
  return (await unwrap(
    await client.automation[":id"].$put({
      param: { id },
      json: input as never,
    }),
  )) as unknown as Automation;
}

export async function setAutomationEnabled(id: string, enabled: boolean) {
  return unwrap(
    await client.automation[":id"].enabled.$patch({
      param: { id },
      json: { enabled },
    }),
  );
}

export async function archiveAutomation(id: string) {
  return unwrap(await client.automation[":id"].$delete({ param: { id } }));
}

export async function getAutomationRuns(
  id: string,
  cursor?: { before: string; beforeId: string },
): Promise<AutomationRun[]> {
  return (await unwrap(
    await client.automation[":id"].runs.$get({
      param: { id },
      query: cursor ? { ...cursor, limit: "50" } : { limit: "50" },
    }),
  )) as AutomationRun[];
}
