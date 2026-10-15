import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createWikiPage,
  deleteWikiPage,
  moveWikiPage,
  restoreWikiVersion,
  saveWikiPage,
} from "@/fetchers/wiki";
import { wikiKey } from "@/hooks/queries/wiki/use-wiki";

/**
 * Crear, guardar, mover, borrar y restaurar paginas. El canal de usuario avisa
 * a los demas; a quien lo hizo tambien le llega, pero no hay que esperarlo.
 */
export function useWikiMutations(workspaceId: string) {
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: wikiKey(workspaceId) });

  return {
    create: useMutation({
      mutationFn: (input: Parameters<typeof createWikiPage>[1]) =>
        createWikiPage(workspaceId, input),
      onSuccess: refresh,
    }),
    save: useMutation({
      mutationFn: ({
        pageId,
        ...input
      }: { pageId: string } & Parameters<typeof saveWikiPage>[1]) =>
        saveWikiPage(pageId, input),
      onSuccess: refresh,
    }),
    move: useMutation({
      mutationFn: ({
        pageId,
        parentId,
      }: {
        pageId: string;
        parentId: string | null;
      }) => moveWikiPage(pageId, parentId),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: ({
        pageId,
        children,
      }: {
        pageId: string;
        children: "lift" | "delete";
      }) => deleteWikiPage(pageId, children),
      onSuccess: refresh,
    }),
    restore: useMutation({
      mutationFn: ({
        pageId,
        ...input
      }: {
        pageId: string;
        version: number;
        baseVersion: number;
      }) => restoreWikiVersion(pageId, input),
      onSuccess: refresh,
    }),
  };
}
