import { useMutation, useQueryClient } from "@tanstack/react-query";
import updateTask from "@/fetchers/task/update-task";
import type Task from "@/types/task";

export function useUpdateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (task: Task) => updateTask(task.id, task),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["task", variables.id],
      });
      queryClient.invalidateQueries({
        queryKey: ["tasks", variables.projectId],
      });
      queryClient.invalidateQueries({
        queryKey: ["notifications"],
      });
      queryClient.invalidateQueries({
        queryKey: ["projects"],
      });
      queryClient.invalidateQueries({
        queryKey: ["activities", variables.id],
      });
      // Las lecturas personales tampoco cuelgan de ["tasks", projectId]; el
      // dialogo de crear tarea termina aqui cuando ya habia creado un
      // borrador (al subir una imagen), no en `useCreateTask`.
      for (const key of ["my-work", "planner", "today"]) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
    },
  });
}
