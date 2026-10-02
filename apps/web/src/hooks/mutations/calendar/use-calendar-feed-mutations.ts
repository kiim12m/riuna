import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createCalendarFeed, deleteCalendarFeed } from "@/fetchers/calendar";

/** Crear, regenerar y revocar el enlace del calendario (ADR 057). */
export function useCalendarFeedMutations(workspaceId: string) {
  const queryClient = useQueryClient();
  const queryKey = ["calendar-feed", workspaceId];
  const onSettled = () => queryClient.invalidateQueries({ queryKey });

  const create = useMutation({
    mutationFn: () => createCalendarFeed(workspaceId),
    onSettled,
  });
  const revoke = useMutation({
    mutationFn: () => deleteCalendarFeed(workspaceId),
    onSettled,
  });

  return { create, revoke };
}
