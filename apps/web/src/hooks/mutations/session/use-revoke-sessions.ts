import { useMutation, useQueryClient } from "@tanstack/react-query";
import { revokeOtherSessions, revokeSession } from "@/fetchers/session";
import { MY_SESSIONS_KEY } from "@/hooks/queries/session/use-my-sessions";

/** Cierra una sesion (su `id`) o todas menos esta (`null`). */
export function useRevokeSessions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string | null) =>
      id ? revokeSession(id) : revokeOtherSessions(),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: MY_SESSIONS_KEY });
    },
  });
}
