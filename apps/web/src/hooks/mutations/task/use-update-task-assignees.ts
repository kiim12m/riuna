import { useMutation, useQueryClient } from "@tanstack/react-query";
import updateTaskAssignees from "@/fetchers/task/update-task-assignees";

export function useUpdateTaskAssignees() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, userIds }: { taskId: string; userIds: string[] }) =>
      updateTaskAssignees(taskId, userIds),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["task", variables.taskId] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({
        queryKey: ["activities", variables.taskId],
      });
    },
  });
}
