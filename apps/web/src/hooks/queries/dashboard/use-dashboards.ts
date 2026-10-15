import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  createDashboard,
  createWidget,
  deleteDashboard,
  deleteWidget,
  getDashboardData,
  getDashboards,
  getWidgetTasks,
  reorderWidgets,
  resetDashboardLayout,
  updateDashboard,
  updateWidget,
} from "@/fetchers/dashboard";
import { useUserPreferencesStore } from "@/store/user-preferences";

export function useGetDashboards(workspaceId: string) {
  return useQuery({
    queryKey: ["dashboards", workspaceId],
    queryFn: () => getDashboards(workspaceId),
    enabled: Boolean(workspaceId),
  });
}

/**
 * Los datos de todos los widgets, en una peticion.
 *
 * **Se recalcula por intervalo y no por WebSocket.** No hay canal de espacio de
 * trabajo —solo de proyecto y de usuario— y un panel no tiene destinatarios que
 * estrechar: cualquier cambio del espacio ensucia todos los widgets, asi que
 * una actualizacion masiva seria una tormenta de invalidaciones a barrido
 * completo por widget. El intervalo es el precedente de "Mi trabajo", y con
 * `refetchIntervalInBackground` en falso una pestana oculta no cuesta nada.
 *
 * Presupuesto explicito: un panel abierto es un barrido por widget cada minuto.
 */
export function useGetDashboardData(dashboardId: string | undefined) {
  // La ventana del widget semanal la calcula el servidor, pero el inicio de
  // semana es preferencia de quien mira. Va en la clave: sin eso, cambiarla no
  // refrescaria nada. El prefijo `["dashboard-data"]` se conserva, que es lo
  // que invalida `use-user-websocket.ts`.
  const weekStartsOn = useUserPreferencesStore((state) => state.weekStartsOn);

  return useQuery({
    queryKey: ["dashboard-data", dashboardId, weekStartsOn],
    queryFn: () => getDashboardData(dashboardId as string, weekStartsOn),
    enabled: Boolean(dashboardId),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

/**
 * La lista de una tarjeta de recuento, que solo se pide con el dialogo abierto.
 *
 * Cuelga de `["dashboard-data"]` a proposito: es lo que invalidan las
 * mutaciones del panel y `use-user-websocket.ts`, asi que la lista se refresca
 * a la vez que la cifra y no puede quedarse contando otra cosa.
 */
export function useGetWidgetTasks(widgetId: string, enabled: boolean) {
  const weekStartsOn = useUserPreferencesStore((state) => state.weekStartsOn);

  return useInfiniteQuery({
    queryKey: ["dashboard-data", "widget-tasks", widgetId, weekStartsOn],
    queryFn: ({ pageParam }) =>
      getWidgetTasks(widgetId, weekStartsOn, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
    enabled,
  });
}

/**
 * Toda mutacion invalida las dos claves: cambiar un widget cambia la lista
 * —su titulo, su sitio— y ademas lo que ese panel calcula.
 */
function useDashboardInvalidation(workspaceId: string) {
  const queryClient = useQueryClient();

  return () => {
    queryClient.invalidateQueries({ queryKey: ["dashboards", workspaceId] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-data"] });
  };
}

export function useDashboardMutations(workspaceId: string) {
  const invalidate = useDashboardInvalidation(workspaceId);

  return {
    createDashboard: useMutation({
      mutationFn: (name: string) => createDashboard({ workspaceId, name }),
      onSuccess: invalidate,
    }),
    renameDashboard: useMutation({
      mutationFn: ({ id, name }: { id: string; name: string }) =>
        updateDashboard(id, { name }),
      onSuccess: invalidate,
    }),
    editDashboard: useMutation({
      mutationFn: ({
        id,
        ...payload
      }: { id: string } & Parameters<typeof updateDashboard>[1]) =>
        updateDashboard(id, payload),
      onSuccess: invalidate,
    }),
    removeDashboard: useMutation({
      mutationFn: (id: string) => deleteDashboard(id),
      onSuccess: invalidate,
    }),
    addWidget: useMutation({
      mutationFn: ({
        dashboardId,
        ...input
      }: { dashboardId: string } & Parameters<typeof createWidget>[1]) =>
        createWidget(dashboardId, input),
      onSuccess: invalidate,
    }),
    editWidget: useMutation({
      mutationFn: ({
        id,
        ...input
      }: { id: string } & Parameters<typeof updateWidget>[1]) =>
        updateWidget(id, input),
      onSuccess: invalidate,
    }),
    removeWidget: useMutation({
      mutationFn: (id: string) => deleteWidget(id),
      onSuccess: invalidate,
    }),
    reorder: useMutation({
      mutationFn: ({
        dashboardId,
        widgetIds,
      }: {
        dashboardId: string;
        widgetIds: string[];
      }) => reorderWidgets(dashboardId, widgetIds),
      onSuccess: invalidate,
    }),
    resetLayout: useMutation({
      mutationFn: (dashboardId: string) => resetDashboardLayout(dashboardId),
      onSuccess: invalidate,
    }),
  };
}
