import { useMutation, useQueryClient } from "@tanstack/react-query";
import updateProjectParent from "@/fetchers/project/update-project-parent";

export function useUpdateProjectParent(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      parentId,
    }: {
      projectId: string;
      parentId: string | null;
    }) => updateProjectParent(projectId, parentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", workspaceId] });
      // Las vistas del padre saben cuantos subproyectos tienen.
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}
