import { useMutation, useQueryClient } from "@tanstack/react-query";
import completeTask from "@/fetchers/task/complete-task";

/**
 * La casilla de "hecha" de Hoy y el Planificador (ADR 046). Invalida en vez
 * de parchear la cache local: la tarea cambia de seccion en las dos
 * pantallas -y a veces de columna en el tablero-, y no vale la pena
 * reproducir esa logica en el cliente para una accion que no es de
 * arrastre.
 */
export function useCompleteTask(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, done }: { taskId: string; done: boolean }) =>
      completeTask(taskId, done),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["today", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["planner", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["my-work"] });
      queryClient.invalidateQueries({ queryKey: ["schedule", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}
