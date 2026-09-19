import { useMutation, useQueryClient } from "@tanstack/react-query";
import createEpic from "@/fetchers/epic/create-epic";
import deleteEpic from "@/fetchers/epic/delete-epic";
import updateEpic from "@/fetchers/epic/update-epic";
import updateTaskEpics from "@/fetchers/epic/update-task-epics";

// Las cuatro mutaciones de epicas invalidan lo mismo —la lista de epicas del
// proyecto y sus tareas— asi que comparten fichero en vez de repetir cuatro
// veces el mismo `onSuccess`.
function useEpicInvalidation(projectId: string) {
  const queryClient = useQueryClient();

  return () => {
    queryClient.invalidateQueries({ queryKey: ["epics", projectId] });
    queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });
  };
}

export function useCreateEpic(projectId: string) {
  const invalidate = useEpicInvalidation(projectId);

  return useMutation({
    mutationFn: (epic: Parameters<typeof createEpic>[1]) =>
      createEpic(projectId, epic),
    onSuccess: invalidate,
  });
}

export function useUpdateEpic(projectId: string) {
  const invalidate = useEpicInvalidation(projectId);

  return useMutation({
    mutationFn: ({
      epicId,
      ...epic
    }: { epicId: string } & Parameters<typeof updateEpic>[1]) =>
      updateEpic(epicId, epic),
    onSuccess: invalidate,
  });
}

export function useDeleteEpic(projectId: string) {
  const invalidate = useEpicInvalidation(projectId);

  return useMutation({
    mutationFn: (epicId: string) => deleteEpic(epicId),
    onSuccess: invalidate,
  });
}

export function useUpdateTaskEpics(projectId: string) {
  const queryClient = useQueryClient();
  const invalidate = useEpicInvalidation(projectId);

  return useMutation({
    mutationFn: ({ taskId, epicIds }: { taskId: string; epicIds: string[] }) =>
      updateTaskEpics(taskId, epicIds),
    onSuccess: (_, variables) => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["task", variables.taskId] });
    },
  });
}
