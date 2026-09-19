import { getStatusLabel } from "@/lib/i18n/domain";
import type { Notification } from "@/types/notification";

type Translate = (key: string, options?: Record<string, unknown>) => string;

/**
 * El texto y el destino de una notificacion, fuera de todo componente.
 *
 * Vivian dentro de `notification-dropdown.tsx`, que era su unico consumidor.
 * La bandeja de "Mi trabajo" es el segundo, y duplicarlos ahi no seria un
 * problema de estilo sino un fallo visible: pinchar una notificacion navegaria
 * en un sitio y no haria nada en el otro en cuanto los dos casos divergieran.
 */
export function getEventDataRecord(
  eventData: unknown,
): Record<string, unknown> | null {
  if (!eventData || typeof eventData !== "object" || Array.isArray(eventData)) {
    return null;
  }

  return eventData as Record<string, unknown>;
}

function getReminderLeadTime(eventData: Record<string, unknown>, t: Translate) {
  const minutes = Number(eventData.leadTimeMinutes ?? 1440);
  if (minutes % 1440 === 0) {
    return t("notifications:reminderLeadTime.days", {
      count: minutes / 1440,
    });
  }
  if (minutes % 60 === 0) {
    return t("notifications:reminderLeadTime.hours", {
      count: minutes / 60,
    });
  }
  return t("notifications:reminderLeadTime.minutes", { count: minutes });
}

export function getNotificationTitle(notification: Notification, t: Translate) {
  const eventData = getEventDataRecord(notification.eventData);
  if (eventData) {
    switch (notification.type) {
      case "task_created":
        return t("notifications:events.task_created.title", {
          ...eventData,
          defaultValue: notification.title ?? notification.type,
        });
      case "workspace_created":
        return t("notifications:events.workspace_created.title", {
          ...eventData,
          defaultValue: notification.title ?? notification.type,
        });
      case "task_status_changed":
        return t("notifications:events.task_status_changed.title", {
          ...eventData,
          defaultValue: notification.title ?? notification.type,
        });
      case "task_assignee_changed":
        return t("notifications:events.task_assignee_changed.title", {
          ...eventData,
          defaultValue: notification.title ?? notification.type,
        });
      case "time_entry_created":
        return t("notifications:events.time_entry_created.title", {
          ...eventData,
          defaultValue: notification.title ?? notification.type,
        });
      case "task_mention":
        return t("notifications:events.task_mention.title", {
          ...eventData,
          defaultValue: notification.title ?? notification.type,
        });
      case "task_comment":
        return t("notifications:events.task_comment.title", {
          ...eventData,
          defaultValue: notification.title ?? notification.type,
        });
      case "due_date_reminder":
        return t("notifications:events.due_date_reminder.title", {
          ...eventData,
          defaultValue: notification.title ?? notification.type,
        });
      case "task_overdue":
        return t("notifications:events.task_overdue.title", {
          ...eventData,
          defaultValue: notification.title ?? notification.type,
        });
      default:
        break;
    }
  }

  return notification.title ?? notification.type;
}

export function getNotificationContent(
  notification: Notification,
  t: Translate,
) {
  const eventData = getEventDataRecord(notification.eventData);
  if (eventData) {
    switch (notification.type) {
      case "task_created":
        return t("notifications:events.task_created.content", {
          ...eventData,
          defaultValue: notification.content ?? "",
        });
      case "workspace_created":
        return t("notifications:events.workspace_created.content", {
          ...eventData,
          defaultValue: notification.content ?? "",
        });
      case "task_status_changed":
        return t("notifications:events.task_status_changed.content", {
          ...eventData,
          oldStatus: getStatusLabel(String(eventData.oldStatus ?? "")),
          newStatus: getStatusLabel(String(eventData.newStatus ?? "")),
          defaultValue: notification.content ?? "",
        });
      case "task_assignee_changed":
        return t("notifications:events.task_assignee_changed.content", {
          ...eventData,
          defaultValue: notification.content ?? "",
        });
      case "time_entry_created":
        return eventData.taskTitle
          ? t("notifications:events.time_entry_created.contentWithTask", {
              ...eventData,
              defaultValue: notification.content ?? "",
            })
          : t("notifications:events.time_entry_created.contentWithoutTask", {
              ...eventData,
              defaultValue: notification.content ?? "",
            });
      case "task_mention":
        return t("notifications:events.task_mention.content", {
          ...eventData,
          defaultValue: notification.content ?? "",
        });
      case "task_comment":
        return t("notifications:events.task_comment.content", {
          ...eventData,
          defaultValue: notification.content ?? "",
        });
      case "due_date_reminder":
        return t("notifications:events.due_date_reminder.content", {
          ...eventData,
          leadTime: getReminderLeadTime(eventData, t),
          defaultValue: notification.content ?? "",
        });
      case "task_overdue":
        return t("notifications:events.task_overdue.content", {
          ...eventData,
          defaultValue: notification.content ?? "",
        });
      default:
        break;
    }
  }

  return notification.content ?? "";
}

export type NotificationTarget = {
  workspaceId: string;
  projectId: string;
  taskId: string;
};

/** A donde lleva pinchar una notificacion, o `null` si no lleva a ningun sitio. */
export function getNotificationTarget(
  notification: Notification,
): NotificationTarget | null {
  if (notification.resourceType !== "task") return null;

  const eventData = getEventDataRecord(notification.eventData);
  const workspaceId =
    typeof eventData?.workspaceId === "string" ? eventData.workspaceId : null;
  const projectId =
    typeof eventData?.projectId === "string" ? eventData.projectId : null;
  const taskId = notification.resourceId ?? null;

  if (!workspaceId || !projectId || !taskId) return null;

  return { workspaceId, projectId, taskId };
}
