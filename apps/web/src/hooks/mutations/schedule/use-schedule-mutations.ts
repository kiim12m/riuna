import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ScheduleResizeEvent } from "@/components/schedule/time-grid";
import { setPlanEntry } from "@/fetchers/planner";
import {
  type CreateBlockInput,
  createBlock,
  deleteBlock,
  type ScheduleResponse,
  setEntryTime,
  type UpdateBlockInput,
  updateBlock,
} from "@/fetchers/schedule";
import updateTaskEstimate from "@/fetchers/task/update-task-estimate";
import { toast } from "@/lib/toast";

/** El `task` que trae cada tramo anclado o que fluye -el destino optimista
 * de `moveEntryDay` necesita esta forma exacta, no la reconstruye. */
type ScheduleSegmentTask = Extract<
  ScheduleResponse["days"][number]["segments"][number],
  { type: "pinned" }
>["task"];

/**
 * Sin cirugia de cache antes de mutar, a diferencia de `usePlannerMutations`:
 * el arrastre aqui es puntero continuo (`gantt-task-bar.tsx`), no dnd-kit, asi
 * que el propio componente lleva su estado optimista (`dragDisplay`) y solo
 * hace falta invalidar al asentarse. La excepcion es `moveEntryDay`: el
 * tramo desaparece de su columna en cuanto se suelta (`segment-card.tsx` dejo
 * de mostrarlo), asi que sin escribir la cache primero se veria un salto -la
 * tarea "desaparecida" hasta que llega el refetch. Ver su comentario.
 *
 * Invalida por el prefijo `["schedule", workspaceId]`, no una clave exacta:
 * la vista Dia/Semana/Mes cambia `from`/`days` al navegar, y mutar desde
 * cualquiera de ellas debe refrescar las demas tambien.
 */
export function useScheduleMutations(workspaceId: string) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ["schedule", workspaceId], [workspaceId]);
  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const setEntryTimeMutation = useMutation({
    mutationFn: ({
      taskId,
      startMinute,
    }: {
      taskId: string;
      startMinute: number | null;
    }) => setEntryTime(workspaceId, taskId, startMinute),
    onSettled: invalidate,
  });

  const createBlockMutation = useMutation({
    mutationFn: (input: CreateBlockInput) => createBlock(workspaceId, input),
    onSettled: invalidate,
  });

  const updateBlockMutation = useMutation({
    mutationFn: ({ id, ...input }: { id: string } & UpdateBlockInput) =>
      updateBlock(workspaceId, id, input),
    onSettled: invalidate,
  });

  const deleteBlockMutation = useMutation({
    mutationFn: (id: string) => deleteBlock(workspaceId, id),
    onSettled: invalidate,
  });

  /**
   * Redimensionar un borde (`segment-card.tsx`) escribe la estimacion de la
   * tarea, no una columna del Cronograma: es la unica fuente de duracion que
   * existe. `deltaSeconds` es relativo al tramo mostrado, nunca a la
   * estimacion entera -un tramo partido alrededor de un bloque fijo no es la
   * tarea completa-, asi que se suma sobre `baseEstimateSeconds` en vez de
   * sustituirla.
   *
   * Las dos escrituras (estimacion, y -solo en el borde superior- hora de
   * anclaje) no son atomicas: si la segunda falla tras la primera, se
   * compensa devolviendo la estimacion a `previousEstimate` antes de avisar
   * del error -si no, el toast de error mentiria («no se ha guardado nada»)
   * mientras la estimacion ya habria cambiado en el servidor-.
   */
  const resizeEntryMutation = useMutation({
    mutationFn: async ({
      taskId,
      previousEstimate,
      baseEstimateSeconds,
      minEstimateSeconds,
      deltaSeconds,
      startMinute,
    }: ScheduleResizeEvent) => {
      const nextEstimate = Math.max(
        minEstimateSeconds,
        baseEstimateSeconds + deltaSeconds,
      );
      await updateTaskEstimate(taskId, nextEstimate);
      if (startMinute !== undefined) {
        try {
          await setEntryTime(workspaceId, taskId, startMinute);
        } catch (error) {
          await updateTaskEstimate(taskId, previousEstimate).catch(() => {
            // Si tambien falla la compensacion, no hay mas que hacer aqui:
            // la invalidacion de abajo trae de vuelta lo que haya de verdad
            // en el servidor, sea lo que sea.
          });
          throw error;
        }
      }
      return { taskId };
    },
    onError: () => {
      // La invalidacion de abajo trae de vuelta el tramo real y deshace el
      // estado optimista que dejo el arrastre.
      toast.error(t("schedule:resizeError"));
    },
    onSettled: (_data, _error, variables) => {
      invalidate();
      void queryClient.invalidateQueries({
        queryKey: ["planner", workspaceId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["task", variables.taskId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["tasks", variables.projectId],
      });
    },
  });

  /**
   * Arrastrar un tramo a la columna de otro dia (`segment-card.tsx`,
   * `dayKeyAtPoint`): mueve el plan del Planificador, no solo la hora -por
   * eso pasa por `PUT /planner/:taskId` y no por `setEntryTime`, que ni
   * siquiera tiene `plannedDate` que tocar-. Queda anclado en el dia nuevo,
   * como ya haria arrastrar dentro del mismo dia.
   *
   * `onMutate` escribe la cache antes de que la peticion salga: en cuanto se
   * suelta el puntero, `segment-card.tsx` deja de dibujar el tramo (ya no
   * hay estado de arrastre que lo sostenga) y sin esto la tarea "desaparece"
   * del todo hasta que vuelve el refetch. Se mueve en cada consulta de
   * `["schedule", workspaceId]` que haya en cache -Dia/Semana/Mes pueden
   * convivir-, tomando la tarea y la duracion del tramo que ya se veia ahi;
   * una vista que no tenga ese dia en rango se deja tal cual.
   */
  const moveEntryDayMutation = useMutation({
    mutationFn: ({
      taskId,
      dayKey,
      startMinute,
    }: {
      taskId: string;
      projectId: string;
      dayKey: string;
      startMinute: number;
      durationMinutes: number;
    }) =>
      setPlanEntry(workspaceId, taskId, { plannedDate: dayKey, startMinute }),
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey });
      const previousQueries = queryClient.getQueriesData<ScheduleResponse>({
        queryKey,
      });

      for (const [cacheKey, snapshot] of previousQueries) {
        if (!snapshot) continue;

        // La tarea tal como estaba en ESTA consulta, de cualquier dia -es de
        // ahi de donde se saca el resto de campos de `task` y la duracion
        // real del tramo, no la que traen las `variables` (esa solo tiene
        // el destino).
        let movedTask: ScheduleSegmentTask | null = null;
        let durationMinutes = variables.durationMinutes;
        for (const day of snapshot.days) {
          for (const segment of day.segments) {
            if (segment.type === "block" || segment.taskId !== variables.taskId)
              continue;
            movedTask = segment.task;
            durationMinutes = (segment.endSecond - segment.startSecond) / 60;
          }
        }
        if (!movedTask) continue;

        const startSecond = variables.startMinute * 60;
        const endSecond = startSecond + durationMinutes * 60;

        const nextDays = snapshot.days.map((day) => {
          const withoutTask = day.segments.filter(
            (segment) =>
              segment.type === "block" || segment.taskId !== variables.taskId,
          );
          if (day.dayDate !== variables.dayKey) {
            return { ...day, segments: withoutTask };
          }
          return {
            ...day,
            segments: [
              ...withoutTask,
              {
                type: "pinned" as const,
                taskId: variables.taskId,
                startSecond,
                endSecond,
                conflict: false,
                task: movedTask,
              },
            ].sort((a, b) => a.startSecond - b.startSecond),
          };
        });
        queryClient.setQueryData(cacheKey, { ...snapshot, days: nextDays });
      }

      return { previousQueries };
    },
    onError: (_error, _variables, context) => {
      for (const [cacheKey, snapshot] of context?.previousQueries ?? []) {
        queryClient.setQueryData(cacheKey, snapshot);
      }
      toast.error(t("schedule:moveDayError"));
    },
    onSettled: (_data, _error, variables) => {
      invalidate();
      void queryClient.invalidateQueries({
        queryKey: ["planner", workspaceId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["tasks", variables.projectId],
      });
    },
  });

  return {
    setEntryTime: setEntryTimeMutation,
    createBlock: createBlockMutation,
    updateBlock: updateBlockMutation,
    deleteBlock: deleteBlockMutation,
    resizeEntry: resizeEntryMutation,
    moveEntryDay: moveEntryDayMutation,
  };
}
