import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createHoliday,
  createTimeOff,
  deleteHoliday,
  deleteTimeOff,
} from "@/fetchers/availability";

/**
 * Un dia no disponible cambia la capacidad (ADR 060): ademas de su lista, se
 * releen el Planificador, el Cronograma y Hoy.
 */
function useInvalidateDays(listKey: string, workspaceId: string) {
  const queryClient = useQueryClient();
  return () => {
    for (const queryKey of [
      [listKey, workspaceId],
      ["planner"],
      ["schedule"],
      ["today"],
    ]) {
      queryClient.invalidateQueries({ queryKey });
    }
  };
}

export function useTimeOffMutations(workspaceId: string) {
  const onSettled = useInvalidateDays("time-off", workspaceId);
  const create = useMutation({
    mutationFn: (input: {
      startsOn: string;
      endsOn: string;
      note: string | null;
    }) => createTimeOff(workspaceId, input),
    onSettled,
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteTimeOff(workspaceId, id),
    onSettled,
  });
  return { create, remove };
}

export function useHolidayMutations(workspaceId: string) {
  const onSettled = useInvalidateDays("holidays", workspaceId);
  const create = useMutation({
    mutationFn: (input: { day: string; name: string }) =>
      createHoliday(workspaceId, input),
    onSettled,
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteHoliday(workspaceId, id),
    onSettled,
  });
  return { create, remove };
}
