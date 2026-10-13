import { useMutation, useQueryClient } from "@tanstack/react-query";
import updateTaskMilestone from "@/fetchers/task/update-task-milestone";

export function useUpdateTaskMilestone() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      taskId,
      isMilestone,
    }: {
      taskId: string;
      projectId: string;
      isMilestone: boolean;
    }) => updateTaskMilestone(taskId, isMilestone),
    onSuccess: (_, { taskId, projectId }) => {
      queryClient.invalidateQueries({ queryKey: ["task", taskId] });
      queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });
      queryClient.invalidateQueries({ queryKey: ["activities", taskId] });
    },
  });
}
