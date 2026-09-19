import { useMutation, useQueryClient } from "@tanstack/react-query";
import updateTaskParent from "@/fetchers/task/update-task-parent";

type ReparentInput = {
  taskId: string;
  parentId: string | null;
  projectId: string;
  /** El padre anterior, si lo habia: su agregado tambien cambia. */
  previousParentId?: string | null;
};

export function useUpdateTaskParent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, parentId }: ReparentInput) =>
      updateTaskParent(taskId, parentId),
    onSuccess: (_, variables) => {
      // Mover una rama cambia el agregado de los dos padres y el camino de
      // todo lo que colgaba; recargar el proyecto entero es mas barato que
      // adivinar que filas han quedado obsoletas.
      queryClient.invalidateQueries({
        queryKey: ["tasks", variables.projectId],
      });
      queryClient.invalidateQueries({ queryKey: ["task", variables.taskId] });
      if (variables.parentId) {
        queryClient.invalidateQueries({
          queryKey: ["task", variables.parentId],
        });
      }
      if (variables.previousParentId) {
        queryClient.invalidateQueries({
          queryKey: ["task", variables.previousParentId],
        });
      }
    },
  });
}
