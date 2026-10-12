import { useQuery } from "@tanstack/react-query";
import { getTaskReminder } from "@/fetchers/task-reminder";

/**
 * Fuera de `["task", id]` a proposito: es privado y nadie mas lo cambia, asi
 * que no tiene por que volver a pedirse en cada cambio de la tarea.
 */
export function taskReminderKey(taskId: string) {
  return ["task-reminder", taskId] as const;
}

export function useTaskReminder(taskId: string) {
  return useQuery({
    queryKey: taskReminderKey(taskId),
    queryFn: () => getTaskReminder(taskId),
    enabled: Boolean(taskId),
  });
}
