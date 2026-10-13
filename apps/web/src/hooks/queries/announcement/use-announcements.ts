import { useQuery } from "@tanstack/react-query";
import {
  type AnnouncementScope,
  getAnnouncements,
  getPinnedAnnouncement,
} from "@/fetchers/announcement";

/**
 * Todas cuelgan de `["announcements", workspaceId]`: el canal de usuario las
 * invalida juntas cuando cambia cualquier aviso del espacio (ADR 081).
 */
export function announcementsKey(workspaceId: string, scope?: string) {
  return scope
    ? (["announcements", workspaceId, scope] as const)
    : (["announcements", workspaceId] as const);
}

export function useAnnouncements(
  workspaceId: string,
  scope: AnnouncementScope,
) {
  const scopeKey =
    scope.kind === "project" ? `project:${scope.projectId}` : "workspace";
  return useQuery({
    queryKey: announcementsKey(workspaceId, scopeKey),
    queryFn: () => getAnnouncements(scope),
    enabled: Boolean(workspaceId),
  });
}

export function usePinnedAnnouncement(
  workspaceId: string,
  projectId: string,
  enabled = true,
) {
  return useQuery({
    queryKey: announcementsKey(workspaceId, `pinned:${projectId}`),
    queryFn: () => getPinnedAnnouncement(projectId),
    enabled: Boolean(workspaceId && projectId) && enabled,
    // Un aviso fijado «hasta el jueves» deja de estarlo sin que nadie lo toque.
    refetchInterval: 15 * 60 * 1000,
  });
}
