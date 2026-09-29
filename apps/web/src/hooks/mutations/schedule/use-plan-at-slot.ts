import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { setPlanEntry } from "@/fetchers/planner";
import useCreateTask from "@/hooks/mutations/task/use-create-task";
import { toast } from "@/lib/toast";

/** Duracion por defecto de una tarea creada desde el Cronograma: media hora,
 * igual que `createNewTask` en `create-task-placeholder.component.ts` de
 * super-productivity (`timeEstimate: 30 * 60 * 1000`). */
const DEFAULT_ESTIMATE_SECONDS = 30 * 60;

type PlanAtSlotInput =
  | {
      kind: "new";
      title: string;
      projectId: string;
      plannedDate: string;
      startMinute: number | null;
      userId: string;
    }
  | {
      kind: "existing";
      taskId: string;
      projectId: string;
      plannedDate: string;
      startMinute: number | null;
    };

/**
 * Crea (o reutiliza) una tarea y la deja planificada -y, si se pidio, anclada
 * a una hora- en una sola mutacion: es lo que el clic en el hueco discontinuo
 * del Cronograma dispara (ADR 041). `startMinute: null` planea "para el dia",
 * sin hora fija - el modo que `create-task-placeholder` de super-productivity
 * llama `isForDayMode`.
 */
export function usePlanAtSlot(workspaceId: string) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  // Reutiliza el hook de crear tarea, no el fetcher a secas: asi este flujo
  // no diverge del resto de sitios que crean tareas si `useCreateTask` gana
  // mas invalidaciones el dia de manana (ya invalida `["tasks", projectId]`
  // por su cuenta, y `["task", parentId]` si alguna vez esto acepta crear
  // una subtarea).
  const createTaskMutation = useCreateTask();

  return useMutation({
    mutationFn: async (input: PlanAtSlotInput) => {
      const taskId =
        input.kind === "new"
          ? (
              await createTaskMutation.mutateAsync({
                title: input.title,
                description: "",
                projectId: input.projectId,
                userId: input.userId,
                status: "to-do",
                priority: "medium",
                estimate: DEFAULT_ESTIMATE_SECONDS,
              })
            ).id
          : input.taskId;

      try {
        return await setPlanEntry(workspaceId, taskId, {
          plannedDate: input.plannedDate,
          startMinute: input.startMinute,
        });
      } catch (error) {
        // La tarea ya existe (creada o no) aunque el plan falle: no se
        // pierde, queda en "sin planificar" y se puede reintentar desde ahi.
        toast.error(t("schedule:placeholder.error"));
        throw error;
      }
    },
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({
        queryKey: ["schedule", workspaceId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["planner", workspaceId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["tasks", input.projectId],
      });
    },
  });
}
