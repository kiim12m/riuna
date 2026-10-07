import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  type AutomationInput,
  type AutomationScope,
  archiveAutomation,
  createAutomation,
  getAutomationRuns,
  getAutomations,
  setAutomationEnabled,
  updateAutomation,
} from "@/fetchers/automation";

const scopeKey = (scope: AutomationScope) =>
  scope.kind === "project"
    ? ["automations", "project", scope.projectId]
    : scope.kind === "workspace"
      ? ["automations", "workspace", scope.workspaceId]
      : ["automations", "team", scope.teamId];

// Es una pantalla de ajustes de quien administra (ADR 066): relee al montar
// en vez de escuchar por WebSocket.
export function useGetAutomations(scope: AutomationScope, enabled = true) {
  return useQuery({
    queryKey: scopeKey(scope),
    queryFn: () => getAutomations(scope),
    enabled,
    refetchOnMount: "always",
  });
}

function useInvalidate() {
  const queryClient = useQueryClient();
  // Una regla de equipo tambien sale en la lista del espacio: se refresca
  // todo lo de automatizaciones, que es poco y solo esta en ajustes.
  return () => queryClient.invalidateQueries({ queryKey: ["automations"] });
}

export function useSaveAutomation(scope: AutomationScope) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: AutomationInput }) =>
      id ? updateAutomation(id, input) : createAutomation(scope, input),
    onSuccess: invalidate,
  });
}

export function useSetAutomationEnabled() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      setAutomationEnabled(id, enabled),
    onSuccess: invalidate,
  });
}

export function useArchiveAutomation() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => archiveAutomation(id),
    onSuccess: invalidate,
  });
}

export function useGetAutomationRuns(id: string | null) {
  return useInfiniteQuery({
    queryKey: ["automations", "runs", id],
    enabled: Boolean(id),
    initialPageParam: undefined as
      | { before: string; beforeId: string }
      | undefined,
    queryFn: ({ pageParam }) => getAutomationRuns(id ?? "", pageParam),
    getNextPageParam: (page) => {
      const last = page.at(-1);
      return page.length === 50 && last
        ? { before: last.startedAt, beforeId: last.id }
        : undefined;
    },
    refetchOnMount: "always",
  });
}
