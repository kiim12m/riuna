import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { runManualAction } from "@/fetchers/automation";
import { toast } from "@/lib/toast";

/**
 * Pulsa una accion de un clic. Lo que cambie llega tambien por el WebSocket,
 * pero no a la ventana que lo hizo: aqui se refresca la tarea, su actividad y
 * las listas. Los avisos van en la mutacion y no en cada `mutate`: desde el
 * menu contextual, el componente que pulso ya se ha desmontado al responder.
 */
export function useRunManualAction(taskId: string) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ automationId }: { automationId: string; name: string }) =>
      runManualAction({ taskId, automationId }),
    onSuccess: (result, { name }) => {
      if (result.status === "ok") {
        toast.success(t("tasks:manualActions.done", { name }));
        return;
      }
      const failed = result.actions.find(
        (action) => action.status === "failed",
      );
      toast.error(
        t("tasks:manualActions.failed", { name, error: failed?.error ?? "" }),
      );
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : t("tasks:manualActions.error"),
      ),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["task", taskId] });
      queryClient.invalidateQueries({ queryKey: ["activities", taskId] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}
