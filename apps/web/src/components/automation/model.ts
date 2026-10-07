import type {
  Action,
  ActionType,
  Automation,
  AutomationInput,
  Trigger,
  TriggerType,
} from "@/fetchers/automation";

// Lo puro del editor de automatizaciones: que ofrece cada alcance, como nace
// cada pieza, las recetas y el paso de una regla guardada a un borrador.

export type EditorScope = "project" | "workspace";

/** Lo que una regla de cada alcance puede escuchar (ADR 066). */
export function triggerTypesFor(_scope: EditorScope): TriggerType[] {
  return [
    "task.created",
    "task.status_changed",
    "task.assigned",
    "task.priority_changed",
    "task.field_changed",
    "task.commented",
    "task.labeled",
    "task.due_in",
    "task.overdue",
  ];
}

/** Una regla de espacio no mueve de columna: las columnas son de cada proyecto. */
export function actionTypesFor(scope: EditorScope): ActionType[] {
  const all: ActionType[] = [
    "move",
    "complete",
    "priority",
    "due_date",
    "custom_field",
    "label",
    "assign_users",
    "assign_team",
    "create_task",
    "notify",
    "webhook",
    "chat",
  ];
  return scope === "project" ? all : all.filter((type) => type !== "move");
}

export const newId = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

export function newTrigger(type: TriggerType): Trigger {
  switch (type) {
    case "task.due_in":
      return { type, days: 1 };
    case "schedule":
      return { type, weekdays: [1, 2, 3, 4, 5], time: "09:30" };
    case "task.status_changed":
      return { type, toFinal: true };
    default:
      return { type } as Trigger;
  }
}

export function newAction(type: ActionType): Action {
  const id = newId();
  switch (type) {
    case "move":
      return { id, type, columnId: "" };
    case "complete":
      return { id, type, done: true };
    case "priority":
      return { id, type, priority: "high" };
    case "due_date":
      return { id, type, days: 1 };
    case "custom_field":
      return { id, type, fieldKey: "", value: "" };
    case "label":
      return { id, type, labelId: "" };
    case "assign_users":
      return { id, type, mode: "add", userIds: [] };
    case "assign_team":
      return { id, type, teamId: null };
    case "create_task":
      return { id, type, title: "", asSubtask: true };
    case "notify":
      return { id, type, recipients: { assignees: true }, message: "" };
    case "webhook":
      return { id, type, url: "" };
    case "chat":
      return { id, type, channel: "slack", message: "" };
    case "standup":
      return { id, type, channel: "slack", destination: {} };
  }
}

/**
 * Una regla guardada como borrador. Los secretos no vuelven nunca de la API
 * (`hasSecret`, `hasWebhookUrl`…): se dejan fuera, y la API conserva los
 * guardados mientras no se escriba otro.
 */
export function toDraft(automation: Automation): AutomationInput {
  return {
    name: automation.name,
    enabled: automation.enabled,
    trigger: automation.trigger,
    ...(automation.teamId ? { teamId: automation.teamId } : {}),
    conditions: automation.conditions,
    actions: automation.actions,
  };
}

export function emptyDraft(): AutomationInput {
  return {
    name: "",
    trigger: newTrigger("task.status_changed"),
    conditions: [],
    actions: [newAction("notify")],
  };
}

export function moveItem<T>(items: readonly T[], from: number, to: number) {
  if (to < 0 || to >= items.length) return [...items];
  const next = [...items];
  const [item] = next.splice(from, 1);
  if (item !== undefined) next.splice(to, 0, item);
  return next;
}

export type Recipe = {
  key: string;
  scopes: EditorScope[];
  build: (texts: { name: string; message: string }) => AutomationInput;
};

/**
 * Reglas listas para usar (3.3): solo rellenan el editor, no hay nada en el
 * servidor. El nombre y el texto llegan traducidos desde quien las pinta.
 */
export const RECIPES: Recipe[] = [
  {
    key: "notifyCreatorOnDone",
    scopes: ["project", "workspace"],
    build: ({ name, message }) => ({
      name,
      trigger: { type: "task.status_changed", toFinal: true },
      conditions: [],
      actions: [
        { id: newId(), type: "notify", recipients: { creator: true }, message },
      ],
    }),
  },
  {
    key: "notifyLeadOnTeam",
    scopes: ["project", "workspace"],
    build: ({ name, message }) => ({
      name,
      trigger: { type: "task.assigned" },
      conditions: [],
      actions: [
        {
          id: newId(),
          type: "notify",
          recipients: { teamLeads: true },
          message,
        },
      ],
    }),
  },
  {
    key: "overdueToHigh",
    scopes: ["project", "workspace"],
    build: ({ name }) => ({
      name,
      trigger: { type: "task.overdue" },
      conditions: [],
      actions: [{ id: newId(), type: "priority", priority: "high" }],
    }),
  },
  {
    key: "urgentToLead",
    scopes: ["project", "workspace"],
    build: ({ name, message }) => ({
      name,
      trigger: { type: "task.created" },
      conditions: [
        {
          id: newId(),
          type: "condition",
          field: "priority",
          operator: "eq",
          value: "urgent",
        },
      ],
      actions: [
        {
          id: newId(),
          type: "notify",
          recipients: { teamLeads: true },
          message,
        },
      ],
    }),
  },
  {
    key: "chatOnDone",
    scopes: ["project", "workspace"],
    build: ({ name, message }) => ({
      name,
      trigger: { type: "task.status_changed", toFinal: true },
      conditions: [],
      actions: [{ id: newId(), type: "chat", channel: "slack", message }],
    }),
  },
];

const withoutEmpty = <T extends Record<string, unknown>>(
  value: T,
  keys: string[],
) =>
  Object.fromEntries(
    Object.entries(value).filter(
      ([key, entry]) =>
        !(keys.includes(key) && (entry === "" || entry === undefined)),
    ),
  ) as T;

/**
 * El borrador tal como se manda. En la API un secreto vacio **quita** el
 * guardado, pero en el formulario un campo secreto vacio es el que no se ha
 * tocado —la API nunca lo devuelve—: se deja fuera para que se conserve.
 */
export function toInput(draft: AutomationInput): AutomationInput {
  return {
    ...draft,
    name: draft.name.trim(),
    actions: draft.actions.map((action) => {
      if (action.type === "webhook") return withoutEmpty(action, ["secret"]);
      if (
        (action.type === "chat" || action.type === "standup") &&
        action.destination
      ) {
        return {
          ...action,
          destination: withoutEmpty(action.destination, [
            "webhookUrl",
            "botToken",
            "chatId",
          ]),
        };
      }
      return action;
    }),
  };
}
