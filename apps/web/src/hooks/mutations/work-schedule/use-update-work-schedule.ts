import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateWorkSchedule } from "@/fetchers/work-schedule";

/**
 * Guardar la jornada invalida el Planificador, el Cronograma y Hoy: los
 * tres leen la misma jornada personal (ADR 045) y ninguno vuelve a pedirla
 * por su cuenta al cambiarla.
 */
export function useUpdateWorkSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateWorkSchedule,
    onSuccess: (data) => {
      queryClient.setQueryData(["work-schedule"], data);
      queryClient.invalidateQueries({ queryKey: ["planner"] });
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
      queryClient.invalidateQueries({ queryKey: ["today"] });
    },
  });
}
