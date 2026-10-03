import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type CaptureTaskInput, captureTask } from "@/fetchers/capture";

/**
 * Captura rapida. La tarea nace asignada, quizas planificada y en la Bandeja
 * -creada al vuelo la primera vez-, asi que se releen las pantallas
 * personales, el proyecto de destino y la Bandeja. El canal de usuario no
 * avisa a la ventana que la creo (ADR 048).
 */
export function useCaptureTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CaptureTaskInput) => captureTask(input),
    onSuccess: (captured, input) => {
      for (const queryKey of [
        ["tasks", captured.task.projectId],
        ["my-work"],
        ["planner"],
        ["today"],
        ["schedule"],
        ["inbox", input.workspaceId],
      ]) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
  });
}
