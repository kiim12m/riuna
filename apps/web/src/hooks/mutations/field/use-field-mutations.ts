import { useMutation, useQueryClient } from "@tanstack/react-query";
import createProjectFieldDefinition from "@/fetchers/field/create-project-field-definition";
import updateTaskCustomFields from "@/fetchers/task/update-task-custom-fields";

// Definir un campo cambia las columnas de la tabla; rellenar un valor cambia
// una fila. Las dos invalidan la lista de tareas, y solo la primera la de
// definiciones.
function useFieldInvalidation(projectId: string) {
  const queryClient = useQueryClient();

  return (includeDefinitions: boolean) => {
    queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });
    if (includeDefinitions) {
      queryClient.invalidateQueries({
        queryKey: ["field-definitions", projectId],
      });
    }
  };
}

export function useCreateFieldDefinition(projectId: string) {
  const invalidate = useFieldInvalidation(projectId);

  return useMutation({
    mutationFn: (field: Parameters<typeof createProjectFieldDefinition>[1]) =>
      createProjectFieldDefinition(projectId, field),
    onSuccess: () => invalidate(true),
  });
}

export function useUpdateTaskCustomFields(projectId: string) {
  const invalidate = useFieldInvalidation(projectId);

  return useMutation({
    mutationFn: ({
      taskId,
      values,
    }: {
      taskId: string;
      values: Record<string, unknown>;
    }) => updateTaskCustomFields(taskId, values),
    onSuccess: () => invalidate(false),
  });
}
