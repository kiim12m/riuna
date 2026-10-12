import { useMutation, useQueryClient } from "@tanstack/react-query";
import { unwatchTask, watchTask } from "@/fetchers/task-watcher";
import { taskWatchersKey } from "@/hooks/queries/task-watcher/use-task-watchers";

/**
 * Observar o dejar de observar, a uno mismo o a otra persona. La API devuelve
 * la lista resultante, que se escribe tal cual: el WebSocket no la reenvia a
 * la ventana que hizo el cambio.
 */
export function useSetWatching(taskId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, watch }: { userId?: string; watch: boolean }) =>
      watch ? watchTask({ taskId, userId }) : unwatchTask({ taskId, userId }),
    onSuccess: (watchers) => {
      queryClient.setQueryData(taskWatchersKey(taskId), watchers);
      queryClient.invalidateQueries({ queryKey: ["my-work", "watching"] });
    },
  });
}
