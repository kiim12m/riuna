import { useMutation, useQueryClient } from "@tanstack/react-query";
import deleteTimeEntry from "@/fetchers/time-entry/delete-time-entry";
import updateTimeEntry from "@/fetchers/time-entry/update-time-entry";

/**
 * Editar o borrar una entrada desde el parte de horas invalida el propio
 * parte -clave `["time-sheet"]`, cualquier rango o agrupacion- y no
 * `["time-entries", taskId]`, que es a lo que ya sirve
 * `use-update-time-entry.ts` desde el detalle de una tarea.
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
