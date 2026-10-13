import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import {
  getAnnouncementTarget,
  getNotificationTarget,
  getProjectTarget,
} from "@/lib/notification";
import type { Notification } from "@/types/notification";

/**
 * Abre a donde lleva una notificacion: su tarea, o el tablon de su aviso. La
 * campana y la bandeja de «Mi panel» lo hacen igual, y por eso es uno.
 */
export function useOpenNotification() {
  const navigate = useNavigate();

  return useCallback(
    (notification: Notification) => {
      const task = getNotificationTarget(notification);
      if (task) {
        navigate({
          to: "/dashboard/workspace/$workspaceId/project/$projectId/task/$taskId",
          params: task,
        });
        return;
      }

      const project = getProjectTarget(notification);
      if (project) {
        navigate({
          to: "/dashboard/workspace/$workspaceId/project/$projectId/board",
          params: project,
        });
        return;
      }

      const announcement = getAnnouncementTarget(notification);
      if (!announcement) return;
      if (announcement.projectId) {
        navigate({
          to: "/dashboard/workspace/$workspaceId/project/$projectId/announcements",
          params: {
            workspaceId: announcement.workspaceId,
            projectId: announcement.projectId,
          },
        });
      } else {
        navigate({
          to: "/dashboard/workspace/$workspaceId/announcements",
          params: { workspaceId: announcement.workspaceId },
        });
      }
    },
    [navigate],
  );
}
