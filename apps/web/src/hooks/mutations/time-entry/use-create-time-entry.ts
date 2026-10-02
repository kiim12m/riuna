import { useMutation, useQueryClient } from "@tanstack/react-query";
import createTimeEntry, {
  type CreateTimeEntryRequest,
} from "@/fetchers/time-entry/create-time-entry";

/**
 * Un registro manual desde el detalle de la tarea. Relee lo que suma tiempo:
 * las entradas de la tarea y el cronometro (`["time-entry"]`), el parte de
 * horas, lo registrado que ensenan Hoy y el Planificador, y la rama de la
 * tarea en su detalle (`["task"]`).
 */
function useCreateTimeEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateTimeEntryRequest) => createTimeEntry(data),
    onSuccess: () => {
      for (const queryKey of [
        ["time-entry"],
        ["time-sheet"],
        ["today"],
        ["planner"],
        ["task"],
      ]) {
        queryClient.invalidateQueries({ queryKey });
      }
    },
  });
}

export default useCreateTimeEntry;
