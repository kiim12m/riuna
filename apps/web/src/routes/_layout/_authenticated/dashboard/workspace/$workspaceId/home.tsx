import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { saveAs } from "file-saver";
import { Download, LayoutDashboard, Plus, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import WorkspaceLayout from "@/components/common/workspace-layout";
import {
  DashboardGrid,
  SortableWidget,
} from "@/components/dashboard/dashboard-grid";
import { GreetingHeader } from "@/components/dashboard/greeting-header";
import {
  WidgetBody,
  type WidgetData,
} from "@/components/dashboard/widget-body";
import { WidgetCard } from "@/components/dashboard/widget-card";
import {
  type WidgetDraft,
  WidgetEditor,
} from "@/components/dashboard/widget-editor";
import PageTitle from "@/components/page-title";
import { useAuth } from "@/components/providers/auth-provider/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type { Widget } from "@/fetchers/dashboard";
import { exportDashboard } from "@/fetchers/dashboard";
import {
  useDashboardMutations,
  useGetDashboardData,
  useGetDashboards,
} from "@/hooks/queries/dashboard/use-dashboards";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { toast } from "@/lib/toast";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/home",
)({
  component: HomeComponent,
});

/**
 * El panel personal: la pantalla que funde lo que eran "Mi trabajo" y "Panel".
 *
 * Eran dos respuestas a la misma pregunta —"que me toca"— con dos formas
 * distintas: una lista fija y una rejilla vacia. Ahora hay una rejilla con una
 * distribucion de partida, y las dos listas de "Mi trabajo" son dos widgets mas
 * que se pueden mover, editar o quitar como cualquier otro.
 *
 * El segmento es `home` y no `dashboard` porque `dashboard` ya es el segmento
 * raiz de la aplicacion, y `/dashboard/workspace/$id/dashboard` es una trampa.
 */
function HomeComponent() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { workspaceId } = Route.useParams();
  const navigate = useNavigate();

  const { data: dashboards, isPending } = useGetDashboards(workspaceId);

  // El panel que se mira. Por defecto **el propio**, no el primero de la lista:
  // desde que se pueden compartir, la lista trae tambien los de otros, y coger
  // el primero significaba que si un companero comparte el suyo y ordena antes,
  // abrias tu inicio y veias el panel de otra persona.
  const [openId, setOpenId] = useState<string | null>(null);
  const mine = dashboards?.find((item) => item.createdBy === user?.id);
  const dashboard =
    dashboards?.find((item) => item.id === openId) ?? mine ?? dashboards?.[0];
  const isMine = dashboard?.createdBy === user?.id;
  const { data, isPending: isDataPending } = useGetDashboardData(dashboard?.id);

  // La regla de la API (`require-dashboard-owner.ts`): lo toca quien lo creo,
  // y un panel compartido tambien quien modera el espacio. Ensenar editar,
  // quitar y arrastrar a cualquier otro solo le daba un 403 sin explicacion.
  const { canModerateShared } = useWorkspacePermission();
  const canEdit =
    isMine || (Boolean(dashboard?.isShared) && canModerateShared());

  const onError = (error: unknown) =>
    toast.error(
      error instanceof Error ? error.message : t("panels:errors.saveFailed"),
    );

  const mutations = useDashboardMutations(workspaceId);
  const [editing, setEditing] = useState<Widget | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const byWidget = useMemo(() => {
    const map = new Map<string, { data?: WidgetData; error?: string }>();
    for (const entry of data?.widgets ?? []) {
      map.set(
        entry.id,
        "error" in entry ? { error: entry.error } : { data: entry.data },
      );
    }
    return map;
  }, [data]);

  const widgets = dashboard?.widgets ?? [];

  const openTask = (projectId: string, taskId: string) =>
    navigate({
      to: "/dashboard/workspace/$workspaceId/project/$projectId/task/$taskId",
      params: { workspaceId, projectId, taskId },
    });

  // El editor se cierra cuando el servidor acepta, no al enviar: si lo rechaza,
  // lo configurado sigue ahi y el error se ve.
  const save = (draft: WidgetDraft) => {
    if (editing) {
      mutations.editWidget.mutate(
        { id: editing.id, ...draft },
        { onSuccess: () => setEditing(null), onError },
      );
      return;
    }

    if (!dashboard) return;
    mutations.addWidget.mutate(
      { dashboardId: dashboard.id, ...draft },
      { onSuccess: () => setIsAdding(false), onError },
    );
  };

  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    if (!dashboard) return;

    setIsExporting(true);
    try {
      const { blob, filename } = await exportDashboard(dashboard.id);
      saveAs(blob, filename);
    } catch (error) {
      toast.error(t("panels:actions.exportError"));
      console.error(error);
    } finally {
      setIsExporting(false);
    }
  };

  const addWidget = () => {
    if (dashboard) {
      setIsAdding(true);
      return;
    }
    // El primer panel se crea al vuelo: pedir "crea un panel" antes de poder
    // anadir nada es un paso que no aporta.
    mutations.createDashboard.mutate(t("panels:defaultName"));
  };

  return (
    <>
      <PageTitle title={t("panels:pageTitle")} />
      <WorkspaceLayout
        title={t("panels:pageTitle")}
        headerActions={
          <>
            {dashboards && dashboards.length > 1 && (
              <Select
                value={dashboard?.id ?? ""}
                onValueChange={(next) =>
                  setOpenId(typeof next === "string" ? next : null)
                }
              >
                <SelectTrigger
                  className="h-7 w-52"
                  aria-label={t("panels:pageTitle")}
                >
                  <SelectValue>{dashboard?.name}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {dashboards.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.createdBy === user?.id
                        ? item.name
                        : `${item.name} · ${t("panels:shared")}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {dashboard && isMine && (
              <Button
                variant="ghost"
                size="xs"
                className="gap-1"
                onClick={() =>
                  mutations.editDashboard.mutate(
                    { id: dashboard.id, isShared: !dashboard.isShared },
                    { onError },
                  )
                }
              >
                {dashboard.isShared ? <Users className="size-3" /> : null}
                {dashboard.isShared
                  ? t("panels:actions.unshare")
                  : t("panels:actions.share")}
              </Button>
            )}
            {dashboard && (
              <Button
                variant="ghost"
                size="xs"
                className="gap-1"
                disabled={isExporting}
                onClick={handleExport}
              >
                <Download className="size-3" />
                {t("panels:actions.export")}
              </Button>
            )}
            {isMine && (
              <Button
                variant="outline"
                size="xs"
                className="gap-1"
                onClick={addWidget}
              >
                <Plus className="size-3" />
                {t("panels:widget.add")}
              </Button>
            )}
          </>
        }
      >
        <div className="p-4">
          <GreetingHeader />
          {isPending ? (
            <div className="grid grid-cols-1 gap-(--density-col-gap) sm:grid-cols-2 lg:grid-cols-3">
              {["a", "b", "c"].map((key) => (
                <Skeleton key={key} className="h-40 w-full rounded-lg" />
              ))}
            </div>
          ) : widgets.length === 0 ? (
            <Empty className="min-h-[50vh]">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <LayoutDashboard />
                </EmptyMedia>
                <EmptyTitle>{t("panels:empty.title")}</EmptyTitle>
                <EmptyDescription>
                  {t("panels:empty.description")}
                </EmptyDescription>
              </EmptyHeader>
              {/* Sin panel todavia, anadir crea el propio; con uno ajeno, no. */}
              {(canEdit || !dashboard) && (
                <EmptyContent>
                  <Button onClick={addWidget}>
                    <Plus />
                    {t("panels:widget.add")}
                  </Button>
                </EmptyContent>
              )}
            </Empty>
          ) : (
            <DashboardGrid
              ids={widgets.map((widget) => widget.id)}
              disabled={!canEdit}
              onReorder={(widgetIds) =>
                dashboard &&
                mutations.reorder.mutate(
                  { dashboardId: dashboard.id, widgetIds },
                  { onError },
                )
              }
            >
              {widgets.map((widget) => {
                const entry = byWidget.get(widget.id);

                return (
                  <SortableWidget key={widget.id} id={widget.id}>
                    <WidgetCard
                      title={widget.title}
                      span={widget.span}
                      isLoading={isDataPending}
                      error={entry?.error}
                      {...(canEdit
                        ? {
                            onEdit: () => setEditing(widget),
                            onDelete: () =>
                              mutations.removeWidget.mutate(widget.id, {
                                onError,
                              }),
                          }
                        : {})}
                    >
                      <WidgetBody
                        widget={widget}
                        data={entry?.data ?? {}}
                        onOpenTask={openTask}
                      />
                    </WidgetCard>
                  </SortableWidget>
                );
              })}
            </DashboardGrid>
          )}
        </div>
      </WorkspaceLayout>

      {(isAdding || editing) && (
        <WidgetEditor
          open
          workspaceId={workspaceId}
          widget={editing ?? undefined}
          onClose={() => {
            setIsAdding(false);
            setEditing(null);
          }}
          onSave={save}
        />
      )}
    </>
  );
}
