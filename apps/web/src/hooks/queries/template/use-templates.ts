import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  applyTemplate,
  captureProjectTemplate,
  captureTaskTemplate,
  deleteTemplate,
  getTemplates,
} from "@/fetchers/template";

export function useGetTemplates(workspaceId: string) {
  return useQuery({
    queryKey: ["templates", workspaceId],
    queryFn: () => getTemplates(workspaceId),
    enabled: Boolean(workspaceId),
  });
}

function useTemplateInvalidation(workspaceId: string) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["templates", workspaceId] });
  };
}

export function useCaptureTaskTemplate(workspaceId: string) {
  const invalidate = useTemplateInvalidation(workspaceId);

  return useMutation({
    mutationFn: ({
      taskId,
      ...payload
    }: {
      taskId: string;
      name: string;
      description?: string | null;
    }) => captureTaskTemplate(taskId, payload),
    onSuccess: invalidate,
  });
}

export function useCaptureProjectTemplate(workspaceId: string) {
  const invalidate = useTemplateInvalidation(workspaceId);

  return useMutation({
    mutationFn: ({
      projectId,
      ...payload
    }: {
      projectId: string;
      name: string;
      description?: string | null;
    }) => captureProjectTemplate(projectId, payload),
    onSuccess: invalidate,
  });
}

/**
 * Aplicar una plantilla crea tareas, epicas y etiquetas, asi que invalida el
 * proyecto entero y no solo la lista de plantillas.
 */
export function useApplyTemplate(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      templateId,
      projectId,
      parentId,
    }: {
      templateId: string;
      projectId: string;
      parentId?: string | null;
    }) => applyTemplate(templateId, { projectId, parentId }),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ["templates", workspaceId] });
      queryClient.invalidateQueries({
        queryKey: ["tasks", variables.projectId],
      });
      queryClient.invalidateQueries({
        queryKey: ["epics", variables.projectId],
      });
    },
  });
}

export function useDeleteTemplate(workspaceId: string) {
  const invalidate = useTemplateInvalidation(workspaceId);

  return useMutation({
    mutationFn: (templateId: string) => deleteTemplate(templateId),
    onSuccess: invalidate,
  });
}
