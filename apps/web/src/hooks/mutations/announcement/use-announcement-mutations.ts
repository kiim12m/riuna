import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  type AnnouncementInput,
  type AnnouncementScope,
  createAnnouncement,
  deleteAnnouncement,
  updateAnnouncement,
} from "@/fetchers/announcement";
import { announcementsKey } from "@/hooks/queries/announcement/use-announcements";

/**
 * Publicar, editar y borrar avisos. El canal de usuario avisa a los demas; a
 * quien lo hizo tambien le llega, pero no hay que esperarlo.
 */
export function useAnnouncementMutations(
  workspaceId: string,
  scope: AnnouncementScope,
) {
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: announcementsKey(workspaceId) });

  const create = useMutation({
    mutationFn: (input: AnnouncementInput & { notify: boolean }) =>
      createAnnouncement(scope, input),
    onSuccess: refresh,
  });
  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: AnnouncementInput }) =>
      updateAnnouncement(id, input),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteAnnouncement(id),
    onSuccess: refresh,
  });

  return { create, update, remove };
}
