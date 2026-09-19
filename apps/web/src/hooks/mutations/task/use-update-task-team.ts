import { useMutation, useQueryClient } from "@tanstack/react-query";
import updateTaskTeam from "@/fetchers/task/update-task-team";
import type Task from "@/types/task";

export function useUpdateTaskTeam() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (task: Task) => updateTaskTeam(task.id, task),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["task", variables.id],
      });
      queryClient.invalidateQueries({
        queryKey: ["tasks", variables.projectId],
      });
      queryClient.invalidateQueries({
        queryKey: ["activities", variables.id],
      });
    },
  });
}
