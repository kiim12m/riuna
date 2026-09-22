import { useMutation, useQueryClient } from "@tanstack/react-query";
import deleteView from "@/fetchers/view/delete-view";
import saveProjectView, {
  type SaveViewPayload,
} from "@/fetchers/view/save-project-view";
import saveWorkspaceView from "@/fetchers/view/save-workspace-view";

// Guardar y borrar invalidan lo mismo, asi que comparten fichero en vez de
// repetir dos veces el mismo `onSuccess`.
function useViewInvalidation(projectId: string) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["views", projectId] });
  };
}

function useWorkspaceViewInvalidation(workspaceId: string) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({
      queryKey: ["workspace-views", workspaceId],
    });
  };
}

export function useSaveView(projectId: string) {
  const invalidate = useViewInvalidation(projectId);

  return useMutation({
    mutationFn: (view: SaveViewPayload) => saveProjectView(projectId, view),
    onSuccess: invalidate,
  });
}

export function useDeleteView(projectId: string) {
  const invalidate = useViewInvalidation(projectId);

  return useMutation({
    mutationFn: (viewId: string) => deleteView(viewId),
    onSuccess: invalidate,
  });
}

export function useSaveWorkspaceView(workspaceId: string) {
  const invalidate = useWorkspaceViewInvalidation(workspaceId);

  return useMutation({
    mutationFn: (view: SaveViewPayload) => saveWorkspaceView(workspaceId, view),
    onSuccess: invalidate,
  });
}

export function useDeleteWorkspaceView(workspaceId: string) {
  const invalidate = useWorkspaceViewInvalidation(workspaceId);

  return useMutation({
    mutationFn: (viewId: string) => deleteView(viewId),
    onSuccess: invalidate,
  });
}
