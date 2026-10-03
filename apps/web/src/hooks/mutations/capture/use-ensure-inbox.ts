import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ensureInbox } from "@/fetchers/capture";

/** La Bandeja de quien mira, creada al primer uso (ADR 051). */
export function useEnsureInbox() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (workspaceId: string) => ensureInbox(workspaceId),
    onSuccess: (inbox, workspaceId) => {
      queryClient.setQueryData(["inbox", workspaceId], inbox);
    },
  });
}
