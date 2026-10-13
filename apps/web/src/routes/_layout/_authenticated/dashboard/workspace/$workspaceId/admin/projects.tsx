import { arrayMove } from "@dnd-kit/sortable";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { saveAs } from "file-saver";
import { Download, LayoutGrid, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import WorkspaceLayout from "@/components/common/workspace-layout";
import PageTitle from "@/components/page-title";
import {
  nextSort,
  portfolioColumns,
  portfolioTree,
  sortProjects,
} from "@/components/project/portfolio";
import PortfolioTable, {
  type PortfolioRow,
} from "@/components/project/portfolio-table";
import { HealthDot } from "@/components/project/project-health";
import CreateProjectModal from "@/components/shared/modals/create-project-modal";
import ColumnPicker from "@/components/table-view/column-picker";
import {
  resolveVisibleColumns,
  toggleColumn,
} from "@/components/table-view/columns";
import type { FieldDefinition } from "@/components/table-view/custom-field-cell";
import FilterBar from "@/components/table-view/filter-bar";
import ViewPicker, {
  type SavedView,
} from "@/components/table-view/view-picker";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { shortcuts } from "@/constants/shortcuts";
import exportProjects from "@/fetchers/project/export-projects";
import useReorderProjects from "@/hooks/mutations/project/use-reorder-projects";
import { useUpdateProjectCustomFields } from "@/hooks/mutations/project/use-update-project-custom-fields";
import {
  useDeleteWorkspaceView,
  useSaveWorkspaceView,
} from "@/hooks/mutations/view/use-view-mutations";
import { useGetWorkspaceFieldDefinitions } from "@/hooks/queries/field/use-get-field-definitions";
import { useGetPortfolio } from "@/hooks/queries/project/use-get-portfolio";
import { useGetWorkspaceViews } from "@/hooks/queries/view/use-get-views";
import { useGetActiveWorkspaceUsers } from "@/hooks/queries/workspace-users/use-get-active-workspace-users";
import { useRegisterShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useProjectFilterableFields } from "@/hooks/use-project-filterable-fields";
import { readFilterParam } from "@/hooks/use-url-filter";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { authClient } from "@/lib/auth-client";
import {
  isProjectHealth,
  needsAttention,
  PROJECT_HEALTHS,
} from "@/lib/project-health";
import { toast } from "@/lib/toast";
import { buildFilter, type EditableCondition } from "@/types/task-filter";

/** Los filtros rapidos de la lista (ADR 087), en la URL para pegarlos. */
const QUICK_VIEWS = ["all", "attention", "mine"] as const;
type QuickView = (typeof QUICK_VIEWS)[number];

type ProjectsSearch = {
  show?: Exclude<QuickView, "all">;
  /** Las condiciones del filtro de la cartera (ADR 088). */
  filter?: EditableCondition[];
  /** Las columnas que se ven, por id. Sin dato, todas. */
  columns?: string[];
  /** La vista guardada que se mira, para marcarla en el selector. */
  viewId?: string;
  /** La columna por la que se ordena: `endDate` sube, `-endDate` baja. */
  sort?: string;
};

const SORT_PATTERN = /^-?[\w.]+$/;

const readSearch = (search: Record<string, unknown>): ProjectsSearch => ({
  show:
    search.show === "attention" || search.show === "mine"
      ? search.show
      : undefined,
  filter: readFilterParam(search.filter),
  columns:
    Array.isArray(search.columns) &&
    search.columns.every((id) => typeof id === "string")
      ? (search.columns as string[])
      : undefined,
  viewId: typeof search.viewId === "string" ? search.viewId : undefined,
  sort:
    typeof search.sort === "string" && SORT_PATTERN.test(search.sort)
      ? search.sort
      : undefined,
});

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/admin/projects",
)({
  component: RouteComponent,
  validateSearch: readSearch,
});

function RouteComponent() {
  const { t } = useTranslation();
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const { workspaceId } = Route.useParams();
  const search = Route.useSearch();
  const { show = "all", columns: columnsParam, viewId, sort } = search;
  const navigate = useNavigate();

  const conditions = useMemo(() => search.filter ?? [], [search.filter]);
  const filter = useMemo(() => buildFilter(conditions), [conditions]);
  const {
    data: projects,
    isLoading,
    error,
  } = useGetPortfolio(workspaceId, filter);
  const { data: definitionsData = [] } = useGetWorkspaceFieldDefinitions(
    workspaceId,
    { entity: "project" },
  );
  const definitions = definitionsData as unknown as FieldDefinition[];
  const fields = useProjectFilterableFields(workspaceId, definitions);
  const { data: views = [] } = useGetWorkspaceViews(workspaceId, "portfolio");
  const { mutate: saveView, isPending: isSavingView } =
    useSaveWorkspaceView(workspaceId);
  const { mutate: removeView } = useDeleteWorkspaceView(workspaceId);
  const { mutate: setField } = useUpdateProjectCustomFields(workspaceId);
  const reorderProjects = useReorderProjects();
  const { data: session } = authClient.useSession();
  const { data: workspaceUsers } = useGetActiveWorkspaceUsers(workspaceId);
  const members = useMemo(
    () =>
      (workspaceUsers?.members ?? []).map((member) => ({
        id: member.userId,
        name: member.user?.name ?? "",
        image: member.user?.image ?? null,
      })),
    [workspaceUsers],
  );

  const columnOptions = useMemo(
    () => portfolioColumns(definitions, t),
    [definitions, t],
  );
  const visibleColumns = useMemo(
    () => resolveVisibleColumns(columnsParam, columnOptions),
    [columnsParam, columnOptions],
  );

  const setSearch = useCallback(
    (patch: Partial<ProjectsSearch>) =>
      navigate({
        to: ".",
        search: (previous: ProjectsSearch) => ({ ...previous, ...patch }),
        replace: true,
      }),
    [navigate],
  );

  // El orden manual de un arrastre, hasta que el servidor lo confirma: un
  // estado de React y no la cache, para que dnd-kit no deje un fotograma con
  // las filas sin mover.
  const [droppedOrder, setDroppedOrder] = useState<string[] | null>(null);
  useEffect(() => {
    if (!droppedOrder || !projects) return;
    if (projects.map((project) => project.id).join() === droppedOrder.join()) {
      setDroppedOrder(null);
    }
  }, [projects, droppedOrder]);

  const rows = useMemo(() => {
    let list = (projects ?? []) as unknown as PortfolioRow[];
    if (droppedOrder) {
      const rank = new Map(droppedOrder.map((id, index) => [id, index]));
      list = [...list].sort(
        (a, b) =>
          (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
          (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER),
      );
    }
    list = list.filter((project) =>
      show === "attention"
        ? needsAttention(project.health)
        : show === "mine"
          ? project.leadUserId === session?.user?.id
          : true,
    );
    const nameOf = new Map(members.map((member) => [member.id, member.name]));
    return sortProjects(list, sort, (id) => nameOf.get(id) ?? "");
  }, [projects, droppedOrder, show, session?.user?.id, sort, members]);

  // Cuantos hay en cada estado, sobre lo que deja el filtro.
  const healthCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const project of projects ?? []) {
      const health = isProjectHealth(project.health)
        ? project.health
        : "not_started";
      counts.set(health, (counts.get(health) ?? 0) + 1);
    }
    return counts;
  }, [projects]);

  // Los padres plegados de la cartera en arbol (ADR 089), en esta pestana.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const tree = useMemo(() => portfolioTree(rows, collapsed), [rows, collapsed]);
  const nested = tree.some((row) => row.depth > 0 || row.childCount > 0);

  const { canCreateProjects, canUpdateProjects } = useWorkspacePermission();
  const canCreate = canCreateProjects();
  const canEditProjects = canUpdateProjects();
  // Reordenar a mano solo con la lista entera y en su orden: arrastrar en un
  // subconjunto filtrado u ordenado no diria donde caen los demas.
  // Ni con subproyectos: el orden manual es de una lista plana.
  const canReorder =
    canEditProjects &&
    show === "all" &&
    !sort &&
    conditions.length === 0 &&
    !nested;

  const handleReorder = (activeId: string, overId: string) => {
    if (!projects) return;
    const oldIndex = rows.findIndex((project) => project.id === activeId);
    const newIndex = rows.findIndex((project) => project.id === overId);
    if (oldIndex === -1 || newIndex === -1) return;
    const order = arrayMove(rows, oldIndex, newIndex).map(
      (project) => project.id,
    );
    const byId = new Map(projects.map((project) => [project.id, project]));
    setDroppedOrder(order);
    reorderProjects(
      workspaceId,
      order.flatMap((id) => {
        const project = byId.get(id);
        return project ? [project] : [];
      }),
      {
        onError: () => {
          setDroppedOrder(null);
          toast.error(t("workspace:projects.reorderError"));
        },
      },
    );
  };

  const handleCreateProject = () => {
    if (!canCreate) return;
    setIsCreateProjectOpen(true);
  };

  useRegisterShortcuts({
    sequentialShortcuts: {
      [shortcuts.project.prefix]: {
        [shortcuts.project.create]: handleCreateProject,
      },
    },
  });

  const handleExport = async () => {
    try {
      const { blob, filename } = await exportProjects(workspaceId, filter);
      saveAs(blob, filename);
    } catch (exportError) {
      toast.error(
        exportError instanceof Error
          ? exportError.message
          : t("workspace:projects.exportError"),
      );
    }
  };

  const handleApplyView = (view: SavedView) => {
    const config = readSearch(view.config);
    navigate({
      to: ".",
      search: {
        show: config.show,
        filter: config.filter,
        columns: config.columns,
        viewId: view.id,
      },
      replace: true,
    });
  };

  const handleSaveView = (
    name: string,
    isShared: boolean,
    onSaved: () => void,
  ) => {
    saveView(
      {
        name,
        type: "portfolio",
        isShared,
        config: {
          ...(conditions.length > 0 ? { filter: conditions } : {}),
          ...(columnsParam ? { columns: columnsParam } : {}),
          ...(show !== "all" ? { show } : {}),
        },
      },
      {
        onSuccess: () => {
          onSaved();
          toast.success(t("tasks:table.views.saved"));
        },
        onError: (saveError) =>
          toast.error(
            saveError instanceof Error
              ? saveError.message
              : t("tasks:table.views.saveFailed"),
          ),
      },
    );
  };

  const createButton = canCreate ? (
    <Button
      variant="outline"
      size="xs"
      onClick={handleCreateProject}
      className="gap-1"
    >
      <Plus className="h-3 w-3" />
      {t("workspace:projects.createProject")}
    </Button>
  ) : null;

  const noProjectsAtAll =
    !isLoading && conditions.length === 0 && (projects?.length ?? 0) === 0;

  return (
    <>
      <PageTitle title={t("workspace:projects.pageTitle")} />
      <WorkspaceLayout
        title={t("workspace:projects.pageTitle")}
        headerActions={createButton}
      >
        {noProjectsAtAll ? (
          <Empty className="min-h-[60vh]">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <LayoutGrid />
              </EmptyMedia>
              <EmptyTitle>{t("workspace:projects.emptyTitle")}</EmptyTitle>
              <EmptyDescription>
                {canCreate
                  ? t("workspace:projects.emptyDescription")
                  : t("workspace:projects.emptyDescriptionReadOnly")}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              {canCreate && (
                <Button onClick={handleCreateProject}>
                  <Plus />
                  {t("workspace:projects.createProject")}
                </Button>
              )}
            </EmptyContent>
          </Empty>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1">
              <SegmentedControl
                label={t("workspace:projects.quick.label")}
                value={show}
                onValueChange={(next) =>
                  setSearch({ show: next === "all" ? undefined : next })
                }
                options={QUICK_VIEWS.map((view) => ({
                  value: view,
                  label: t(`workspace:projects.quick.${view}`),
                }))}
              />
              <div
                className="flex flex-wrap items-center gap-3 text-muted-foreground text-xs"
                data-testid="project-health-summary"
              >
                {PROJECT_HEALTHS.filter((health) =>
                  healthCounts.get(health),
                ).map((health) => (
                  <span
                    key={health}
                    className="inline-flex items-center gap-1.5"
                  >
                    <HealthDot health={health} />
                    {t(`workspace:projects.health.${health}`)}
                    <span className="font-medium text-foreground tabular-nums">
                      {healthCounts.get(health)}
                    </span>
                  </span>
                ))}
              </div>
              <div className="ml-auto flex flex-wrap items-center gap-1">
                <ColumnPicker
                  options={columnOptions}
                  visible={visibleColumns}
                  groupLabels={{
                    base: t("workspace:projects.columnsGroup.base"),
                    custom: t("workspace:projects.columnsGroup.custom"),
                  }}
                  onToggle={(id) =>
                    setSearch({
                      columns: toggleColumn(columnsParam, columnOptions, id),
                    })
                  }
                />
                <ViewPicker
                  views={views as SavedView[]}
                  activeViewId={viewId}
                  currentUserId={session?.user?.id}
                  canSave={
                    conditions.length > 0 ||
                    Boolean(columnsParam) ||
                    show !== "all"
                  }
                  saving={isSavingView}
                  onApply={handleApplyView}
                  onSave={handleSaveView}
                  onDelete={(id) =>
                    removeView(id, {
                      onError: (deleteError) =>
                        toast.error(
                          deleteError instanceof Error
                            ? deleteError.message
                            : "Error",
                        ),
                    })
                  }
                />
                <Button
                  variant="ghost"
                  size="xs"
                  className="gap-1.5"
                  data-testid="portfolio-export"
                  onClick={handleExport}
                >
                  <Download className="size-3.5" />
                  {t("workspace:projects.export")}
                </Button>
              </div>
            </div>
            <FilterBar
              fields={fields}
              conditions={conditions}
              onChange={(next) =>
                setSearch({ filter: next.length > 0 ? next : undefined })
              }
            />
            {error && (
              <p className="px-3 text-destructive text-xs">
                {error instanceof Error
                  ? error.message
                  : t("tasks:table.filterFailed")}
              </p>
            )}
            {isLoading ? (
              <div className="space-y-3 p-3">
                {[1, 2, 3].map((index) => (
                  <Skeleton key={index} className="h-6 w-full" />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <p className="px-3 py-10 text-center text-muted-foreground text-sm">
                {t("workspace:projects.noMatches")}
              </p>
            ) : (
              <PortfolioTable
                rows={tree}
                collapsed={collapsed}
                onToggle={(projectId) =>
                  setCollapsed((current) => {
                    const next = new Set(current);
                    if (next.has(projectId)) next.delete(projectId);
                    else next.add(projectId);
                    return next;
                  })
                }
                workspaceId={workspaceId}
                visibleColumns={visibleColumns}
                definitions={definitions}
                members={members}
                sort={sort}
                canEdit={canEditProjects}
                canReorder={canReorder}
                onSort={(id) => setSearch({ sort: nextSort(sort, id) })}
                onReorder={handleReorder}
                onOpen={(projectId) =>
                  navigate({
                    to: "/dashboard/workspace/$workspaceId/project/$projectId/board",
                    params: { workspaceId, projectId },
                  })
                }
                onSetField={(projectId, key, value) =>
                  setField(
                    { projectId, values: { [key]: value } },
                    {
                      onError: (fieldError) =>
                        toast.error(
                          fieldError instanceof Error
                            ? fieldError.message
                            : t("tasks:table.saveFailed"),
                        ),
                    },
                  )
                }
              />
            )}
          </div>
        )}
      </WorkspaceLayout>

      <CreateProjectModal
        open={isCreateProjectOpen}
        onClose={() => setIsCreateProjectOpen(false)}
      />
    </>
  );
}
