import { useMutation, useQueryClient } from "@tanstack/react-query";
import createLocalUser from "@/fetchers/user/create-local-user";

export function useCreateLocalUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createLocalUser,
    onSuccess: (_, variables) => {
      // La tabla de miembros se sirve del espacio completo, no de una consulta
      // propia de miembros.
      queryClient.invalidateQueries({
        queryKey: ["workspace", "full", variables.workspaceId],
      });
      queryClient.invalidateQueries({
        queryKey: ["active-workspace-users", variables.workspaceId],
      });
    },
  });
}

export default useCreateLocalUser;
