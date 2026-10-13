import { useQuery } from "@tanstack/react-query";
import { getManualActions } from "@/fetchers/automation";

/**
 * Cuelga de `["task", id]`: el WebSocket del proyecto la invalida por prefijo
 * en cada cambio de la tarea, que es justo lo que puede hacer que deje de
 * cumplir el «Si» de una accion o que empiece a cumplirlo.
 */
export function manualActionsKey(taskId: string) {
  return ["task", taskId, "manual-actions"] as const;
}

export function useManualActions(taskId: string, enabled = true) {
  return useQuery({
    queryKey: manualActionsKey(taskId),
    queryFn: () => getManualActions(taskId),
    enabled: Boolean(taskId) && enabled,
  });
}
