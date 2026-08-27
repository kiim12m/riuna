import { useMutation, useQueryClient } from "@tanstack/react-query";
import updateProjectTreeSettings from "@/fetchers/project/update-project-tree-settings";

export function useUpdateProjectTreeSettings(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (settings: Parameters<typeof updateProjectTreeSettings>[1]) =>
      updateProjectTreeSettings(projectId, settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}
