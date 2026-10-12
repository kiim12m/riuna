import type { Trigger, TriggerType } from "./definition";

/** El disparador al que responde cada evento del bus. */
export const EVENT_TRIGGERS: Record<string, TriggerType> = {
  "task.created": "task.created",
  "task.status_changed": "task.status_changed",
  // La via de asignacion multiple, la individual heredada y la de equipo.
  "task.assignees_changed": "task.assigned",
  "task.assignee_changed": "task.assigned",
  "task.team_changed": "task.assigned",
  "task.priority_changed": "task.priority_changed",
  "task.custom_fields_changed": "task.field_changed",
  "comment.created": "task.commented",
  "task.label_assigned": "task.labeled",
};

/** Las columnas de un cambio de estado, ya resueltas a partir de sus slugs. */
export type StatusMove = {
  fromColumnId: string | null;
  toColumnId: string | null;
  toFinal: boolean;
};

type EventData = Record<string, unknown>;

const asStrings = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];

function matchesAssignment(
  trigger: Extract<Trigger, { type: "task.assigned" }>,
  eventType: string,
  data: EventData,
) {
  const addedUsers =
    eventType === "task.assignees_changed"
      ? asStrings(data.addedIds)
      : eventType === "task.assignee_changed" && data.newAssigneeId
        ? [String(data.newAssigneeId)]
        : [];
  const addedTeam =
    eventType === "task.team_changed" && data.newTeamId
      ? String(data.newTeamId)
      : null;

  if (trigger.userId) return addedUsers.includes(trigger.userId);
  if (trigger.teamId) return addedTeam === trigger.teamId;
  // Sin a quien: cualquier persona o equipo que entra. Quitar no es asignar.
  return addedUsers.length > 0 || addedTeam !== null;
}

/**
 * Si un evento casa con el disparador de una regla. Es puro: lo que necesita
 * de la base (las columnas de un cambio de estado) llega ya resuelto.
 */
export function matchesTrigger(
  trigger: Trigger,
  eventType: string,
  data: EventData,
  move?: StatusMove,
): boolean {
  if (EVENT_TRIGGERS[eventType] !== trigger.type) return false;

  switch (trigger.type) {
    case "task.created":
    case "task.commented":
      return true;
    case "task.status_changed":
      if (!move) return false;
      if (trigger.fromColumnId && trigger.fromColumnId !== move.fromColumnId) {
        return false;
      }
      if (trigger.toColumnId && trigger.toColumnId !== move.toColumnId) {
        return false;
      }
      return !trigger.toFinal || move.toFinal;
    case "task.assigned":
      return matchesAssignment(trigger, eventType, data);
    case "task.priority_changed":
      return !trigger.to || data.newPriority === trigger.to;
    case "task.field_changed": {
      if (!trigger.fieldKey) return true;
      const changes = Array.isArray(data.changes) ? data.changes : [];
      return changes.some(
        (change) =>
          typeof change === "object" &&
          change !== null &&
          (change as { key?: unknown }).key === trigger.fieldKey,
      );
    }
    case "task.due_in":
    case "task.overdue":
    case "schedule":
      // No vienen del bus: los mira el planificador.
      return false;
    case "manual":
      // Tampoco: los corre quien pulsa el boton (`manual.ts`).
      return false;
    case "task.labeled": {
      if (!trigger.labelName) return true;
      const label = data.label as { name?: unknown } | undefined;
      return (
        typeof label?.name === "string" &&
        label.name.trim().toLowerCase() ===
          trigger.labelName.trim().toLowerCase()
      );
    }
  }
}
