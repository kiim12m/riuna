import { useMutation, useQueryClient } from "@tanstack/react-query";
import createProjectFieldDefinition from "@/fetchers/field/create-project-field-definition";
import createWorkspaceFieldDefinition from "@/fetchers/field/create-workspace-field-definition";
import deleteFieldDefinition from "@/fetchers/field/delete-field-definition";
import updateFieldDefinition from "@/fetchers/field/update-field-definition";

// Un campo cambiado se nota en el editor, en las columnas de la tabla, en los
// filtros y en los widgets: todos cuelgan de este prefijo. Y las tareas guardan
// los valores, asi que borrar uno tambien las refresca.
function useFieldInvalidation() {
  const queryClient = useQueryClient();

  return () => {
    queryClient.invalidateQueries({ queryKey: ["field-definitions"] });
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
  };
}

export function useCreateFieldDefinition(scope: {
  projectId?: string;
  workspaceId: string;
}) {
  const invalidate = useFieldInvalidation();

  return useMutation({
    mutationFn: (
      field: Parameters<typeof createWorkspaceFieldDefinition>[1],
    ) =>
      scope.projectId
        ? createProjectFieldDefinition(scope.projectId, field)
        : createWorkspaceFieldDefinition(scope.workspaceId, field),
    onSuccess: invalidate,
  });
}

export function useUpdateFieldDefinition() {
  const invalidate = useFieldInvalidation();

  return useMutation({
    mutationFn: ({
      id,
      ...patch
    }: { id: string } & Parameters<typeof updateFieldDefinition>[1]) =>
      updateFieldDefinition(id, patch),
    onSuccess: invalidate,
  });
}

export function useDeleteFieldDefinition() {
  const invalidate = useFieldInvalidation();

  return useMutation({
    mutationFn: (id: string) => deleteFieldDefinition(id),
    onSuccess: invalidate,
  });
}
