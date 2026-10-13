import { useMutation, useQueryClient } from "@tanstack/react-query";
import updateProjectStatus, {
  type ProjectStatusInput,
} from "@/fetchers/project/update-project-status";

/**
 * Cambia el estado de un proyecto (ADR 087). La lista y la cabecera leen de
 * `["projects", workspaceId…]`; el WebSocket avisa al resto del espacio.
 */
export function useUpdateProjectStatus(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      input,
    }: {
      projectId: string;
      input: ProjectStatusInput;
    }) => updateProjectStatus(projectId, input),
    onSuccess: (_data, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ["projects", workspaceId] });
      queryClient.invalidateQueries({
        queryKey: ["project-activity", projectId],
      });
    },
  });
}
