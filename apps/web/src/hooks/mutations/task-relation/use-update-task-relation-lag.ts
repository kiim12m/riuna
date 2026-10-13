import { useMutation, useQueryClient } from "@tanstack/react-query";
import updateTaskRelationLag from "@/fetchers/task-relation/update-task-relation-lag";

export function useUpdateTaskRelationLag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, lag }: { id: string; lag: number }) =>
      updateTaskRelationLag(id, lag),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-relations"] });
      queryClient.invalidateQueries({ queryKey: ["task"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}
