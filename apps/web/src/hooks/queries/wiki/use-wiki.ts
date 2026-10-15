import { useQuery } from "@tanstack/react-query";
import {
  getTaskWikiLinks,
  getWikiPage,
  getWikiPages,
  getWikiVersion,
  getWikiVersions,
} from "@/fetchers/wiki";

/**
 * Todo cuelga de `["wiki", workspaceId]`: el canal de usuario lo invalida
 * entero cuando cambia cualquier pagina del espacio (ADR 092).
 */
export function wikiKey(workspaceId: string, ...rest: string[]) {
  return ["wiki", workspaceId, ...rest] as const;
}

export function useWikiPages(workspaceId: string, projectId: string | null) {
  return useQuery({
    queryKey: wikiKey(workspaceId, "pages", projectId ?? "workspace"),
    queryFn: () => getWikiPages(workspaceId, projectId),
    enabled: Boolean(workspaceId),
  });
}

export function useWikiPage(workspaceId: string, pageId: string | undefined) {
  return useQuery({
    queryKey: wikiKey(workspaceId, "page", pageId ?? ""),
    queryFn: () => getWikiPage(pageId ?? ""),
    enabled: Boolean(workspaceId && pageId),
  });
}

export function useWikiVersions(
  workspaceId: string,
  pageId: string | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: wikiKey(workspaceId, "versions", pageId ?? ""),
    queryFn: () => getWikiVersions(pageId ?? ""),
    enabled: Boolean(workspaceId && pageId) && enabled,
  });
}

export function useWikiVersion(
  workspaceId: string,
  pageId: string | undefined,
  version: number | null,
) {
  return useQuery({
    queryKey: wikiKey(workspaceId, "version", pageId ?? "", String(version)),
    queryFn: () => getWikiVersion(pageId ?? "", version ?? 0),
    enabled: Boolean(workspaceId && pageId && version),
    // Una version guardada no cambia nunca.
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useTaskWikiLinks(workspaceId: string, taskId: string) {
  return useQuery({
    queryKey: wikiKey(workspaceId, "task-links", taskId),
    queryFn: () => getTaskWikiLinks(taskId),
    enabled: Boolean(workspaceId && taskId),
  });
}
