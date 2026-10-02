import { useQuery } from "@tanstack/react-query";
import getTimeEntriesByTaskId from "@/fetchers/time-entry/get-time-entries";
import { personalQueryOptions } from "@/hooks/queries/personal-query-options";

/**
 * Las entradas de una tarea, de cualquiera, para su detalle. Bajo el prefijo
 * `["time-entry"]` -antes `["time-entries"]`, fuera de el-: `TIMER_CHANGED`
 * invalida ese prefijo al arrancar, parar, editar o borrar, asi que parar el
 * cronometro desde el pie o corregir una entrada en el parte de horas se ve
 * aqui sin cablear nada mas.
 */
function useGetTimeEntriesByTaskId(taskId: string) {
  return useQuery({
    queryKey: ["time-entry", "task", taskId],
    queryFn: () => getTimeEntriesByTaskId(taskId),
    enabled: !!taskId,
    ...personalQueryOptions,
  });
}

export default useGetTimeEntriesByTaskId;
