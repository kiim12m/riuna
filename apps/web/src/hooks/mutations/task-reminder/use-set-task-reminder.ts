import { useMutation, useQueryClient } from "@tanstack/react-query";
import { clearTaskReminder, setTaskReminder } from "@/fetchers/task-reminder";
import { taskReminderKey } from "@/hooks/queries/task-reminder/use-task-reminder";

/**
 * Pone, cambia o quita (`remindAt: null`) mi recordatorio en la tarea. Sin
 * `note` conserva la que tuviera; `null` la borra.
 */
export function useSetTaskReminder(taskId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      remindAt,
      note,
    }: {
      remindAt: Date | null;
      note?: string | null;
    }) =>
      remindAt
        ? setTaskReminder({ taskId, remindAt: remindAt.toISOString(), note })
        : clearTaskReminder(taskId),
    onSuccess: (reminder) => {
      queryClient.setQueryData(taskReminderKey(taskId), reminder);
    },
  });
}
