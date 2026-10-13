import { useMutation, useQueryClient } from "@tanstack/react-query";
import updateProjectCustomFields from "@/fetchers/project/update-project-custom-fields";

export function useUpdateProjectCustomFields(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      values,
    }: {
      projectId: string;
      values: Record<string, unknown>;
    }) => updateProjectCustomFields(projectId, values),
    onSuccess: (_data, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ["projects", workspaceId] });
      queryClient.invalidateQueries({
        queryKey: ["project-activity", projectId],
      });
    },
  });
}
