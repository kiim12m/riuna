import { useMutation, useQueryClient } from "@tanstack/react-query";
import deleteTimeEntry from "@/fetchers/time-entry/delete-time-entry";
import updateTimeEntry from "@/fetchers/time-entry/update-time-entry";

/**
 * Editar o borrar una entrada desde el parte de horas invalida el propio
 * parte -clave `["time-sheet"]`, cualquier rango o agrupacion-. Las entradas
 * del detalle de la tarea (`["time-entry", "task", taskId]`) las refresca
 * `TIMER_CHANGED`, que la API emite al editar o borrar.
 */
export function useTimeSheetEntryMutations() {
  const queryClient = useQueryClient();

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["time-sheet"] });

  const updateMutation = useMutation({
    mutationFn: updateTimeEntry,
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTimeEntry,
    onSuccess: invalidate,
  });

  return {
    update: updateMutation.mutate,
    isUpdating: updateMutation.isPending,
    remove: deleteMutation.mutate,
    isRemoving: deleteMutation.isPending,
  };
}
