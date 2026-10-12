import { useQuery } from "@tanstack/react-query";
import { getTaskWatchers } from "@/fetchers/task-watcher";

/**
 * Cuelga de `["task", id]` a proposito: el WebSocket del proyecto invalida esa
 * clave por prefijo en cada cambio de la tarea, asi que observar, comentar o
 * reasignar refresca tambien esta lista sin un mensaje propio.
 */
export function taskWatchersKey(taskId: string) {
  return ["task", taskId, "watchers"] as const;
}

export function useTaskWatchers(taskId: string) {
  return useQuery({
    queryKey: taskWatchersKey(taskId),
    queryFn: () => getTaskWatchers(taskId),
    enabled: Boolean(taskId),
  });
}
