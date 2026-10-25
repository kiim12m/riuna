import { useMutation, useQueryClient } from "@tanstack/react-query";
import reorderTask, { type TaskPlacement } from "@/fetchers/task/reorder-task";
import { placeTaskInTasksCache } from "./place-task-in-cache";

type ReorderTaskVariables = TaskPlacement & {
  task: { id: string; status: string };
};

/**
 * Soltar una tarea al arrastrar: una sola peticion, que solo mueve la soltada
 * (auditoria 1.1). El listado se corrige aqui mismo, y dentro de la misma
 * columna no se vuelve a pedir; si falla, se pide para deshacer lo adelantado.
 */
export function useReorderTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ task, ...placement }: ReorderTaskVariables) =>
      reorderTask(task.id, placement),
    onMutate: async ({ task, ...placement }) => {
      // Una peticion del listado que ya estuviera en marcha traeria el orden
      // de antes y desharia el que se acaba de poner.
      await queryClient.cancelQueries({ queryKey: ["tasks"] });
      placeTaskInTasksCache(queryClient, task.id, placement);
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    onSuccess: (_, { task, status }) => {
      if (task.status === status) return;
      // Cambiar de columna si mueve lo demas: el detalle, la actividad, las
      // lecturas personales y, con la cascada, las subtareas del listado.
      queryClient.invalidateQueries({ queryKey: ["task", task.id] });
      queryClient.invalidateQueries({ queryKey: ["activities", task.id] });
      for (const key of [
        "tasks",
        "task-relations",
        "projects",
        "notifications",
        "my-work",
        "planner",
        "today",
      ]) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
    },
  });
}
