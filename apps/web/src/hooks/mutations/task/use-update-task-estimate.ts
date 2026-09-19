import { useMutation, useQueryClient } from "@tanstack/react-query";
import updateTaskEstimate from "@/fetchers/task/update-task-estimate";

type EstimateInput = {
  taskId: string;
  projectId: string;
  estimate: number | null;
};

export function useUpdateTaskEstimate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, estimate }: EstimateInput) =>
      updateTaskEstimate(taskId, estimate),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["task", variables.taskId] });
      queryClient.invalidateQueries({
        queryKey: ["tasks", variables.projectId],
      });
    },
  });
}
