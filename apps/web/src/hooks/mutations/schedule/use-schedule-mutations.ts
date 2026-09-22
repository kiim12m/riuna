import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  type CreateBlockInput,
  createBlock,
  deleteBlock,
  setEntryTime,
  updateBlock,
} from "@/fetchers/schedule";

/**
 * Sin cirugia de cache antes de mutar, a diferencia de `usePlannerMutations`:
 * el arrastre aqui es puntero continuo (`gantt-task-bar.tsx`), no dnd-kit, asi
 * que el propio componente lleva su estado optimista (`dragDisplay`) y solo
 * hace falta invalidar al asentarse.
 */
export function useScheduleMutations(workspaceId: string, days: number) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => ["schedule", workspaceId, days],
    [workspaceId, days],
  );
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
    mutationFn: ({
      id,
      ...input
    }: {
      id: string;
      title: string;
      kind: "fixed" | "break";
      startMinute: number;
      endMinute: number;
    }) => updateBlock(workspaceId, id, input),
    onSettled: invalidate,
  });

  const deleteBlockMutation = useMutation({
    mutationFn: (id: string) => deleteBlock(workspaceId, id),
    onSettled: invalidate,
  });

  return {
    setEntryTime: setEntryTimeMutation,
    createBlock: createBlockMutation,
    updateBlock: updateBlockMutation,
    deleteBlock: deleteBlockMutation,
  };
}
