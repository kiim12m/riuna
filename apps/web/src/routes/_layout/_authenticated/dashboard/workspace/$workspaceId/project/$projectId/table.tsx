import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { BaselinePicker } from "@/components/baseline/baseline-picker";
import { toViewBaseline } from "@/components/baseline/baseline-view";
import ProjectLayout from "@/components/common/project-layout";
import PageTitle from "@/components/page-title";
import { ProjectSizeWarning } from "@/components/project/project-size-warning";
import { SubprojectToggle } from "@/components/project/subproject-toggle";
import TableView from "@/components/table-view";
import type { AddFieldPayload } from "@/components/table-view/add-field-dialog";
import AddFieldDialog from "@/components/table-view/add-field-dialog";

import ColumnPicker from "@/components/table-view/column-picker";
import {
  availableColumns,
  resolveVisibleColumns,
  toggleColumn,
} from "@/components/table-view/columns";
import type { FieldDefinition } from "@/components/table-view/custom-field-cell";
import FilterBar from "@/components/table-view/filter-bar";
import {
  ROW_COLORINGS,
  type RowColoring,
} from "@/components/table-view/row-tint";
import ViewPicker, {
  type SavedView,
} from "@/components/table-view/view-picker";
import TaskDetailsSheet from "@/components/task/task-details-sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useCreateFieldDefinition,
  useUpdateTaskCustomFields,
} from "@/hooks/mutations/field/use-field-mutations";
import {
  useDeleteView,
  useSaveView,
} from "@/hooks/mutations/view/use-view-mutations";
import useGetFieldDefinitions from "@/hooks/queries/field/use-get-field-definitions";
import { useGetTasks } from "@/hooks/queries/task/use-get-tasks";
import { useTaskBaseline } from "@/hooks/queries/task/use-task-baseline";
import { useTaskTotals } from "@/hooks/queries/task/use-task-totals";
import useGetViews from "@/hooks/queries/view/use-get-views";
import { useGetActiveWorkspaceUsers } from "@/hooks/queries/workspace-users/use-get-active-workspace-users";
import { useFilterableFields } from "@/hooks/use-filterable-fields";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { authClient } from "@/lib/auth-client";
import { type BaselineChoice, isBaselineChoice } from "@/lib/baseline";
import { subprojectColumns, subprojectTasks } from "@/lib/subproject-tasks";
import { toast } from "@/lib/toast";
import type Task from "@/types/task";
import { buildFilter, type EditableCondition } from "@/types/task-filter";

type TableSearchParams = {
  taskId?: string;
  /**
   * Las condiciones del filtro. Van como array y no como cadena JSON porque
   * TanStack Router serializa y parsea la busqueda con `JSON.parse`: una
   * cadena que parezca JSON llega ya convertida, y comprobar `typeof
   * === "string"` la descartaba en silencio.
   */
  filter?: EditableCondition[];
  /**
   * Que hace el filtro con la jerarquia. `tree` y `flat` piden lo mismo al
   * servidor y solo cambian como se pinta; `roots` y `withDescendants` cambian
   * la consulta.
   */
  treeMode?: TreeMode;
  /** La vista guardada que se esta mirando, para marcarla en el selector. */
  viewId?: string;
  /** Las columnas que se ven, por id. Sin dato, las de siempre. */
  columns?: string[];
  /** Por que se agrupan las filas. Sin dato, sin agrupar. */
  groupBy?: GroupBy;
  /** Como se colorean las filas (ADR 080). Sin dato, sin color. */
  color?: RowColoring;
  /** Con que momento se compara (ADR 085). Sin dato, con ninguno. */
  baseline?: BaselineChoice;
  /** Con las tareas de los subproyectos (ADR 089). */
  subprojects?: boolean;
};

const GROUP_BYS = ["epic"] as const;
type GroupBy = (typeof GROUP_BYS)[number];

const TREE_MODES = ["tree", "flat", "roots", "withDescendants"] as const;
type TreeMode = (typeof TREE_MODES)[number];

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/project/$projectId/table",
)({
  component: RouteComponent,
  validateSearch: (search: Record<string, unknown>): TableSearchParams => ({
    taskId: typeof search.taskId === "string" ? search.taskId : undefined,
    filter: Array.isArray(search.filter)
      ? (search.filter as EditableCondition[])
      : undefined,
    treeMode: TREE_MODES.includes(search.treeMode as TreeMode)
      ? (search.treeMode as TreeMode)
      : undefined,
    viewId: typeof search.viewId === "string" ? search.viewId : undefined,
    columns:
      Array.isArray(search.columns) &&
      search.columns.every((id) => typeof id === "string")
        ? (search.columns as string[])
        : undefined,
    groupBy: GROUP_BYS.includes(search.groupBy as GroupBy)
      ? (search.groupBy as GroupBy)
      : undefined,
    color: ROW_COLORINGS.includes(search.color as RowColoring)
      ? (search.color as RowColoring)
      : undefined,
    baseline: isBaselineChoice(search.baseline) ? search.baseline : undefined,
    subprojects: search.subprojects === true ? true : undefined,
  }),
});

function RouteComponent() {
  const { t } = useTranslation();
  const { projectId, workspaceId } = Route.useParams();
  const {
    taskId,
    filter: filterParam,
    treeMode = "tree",
    viewId,
    columns: columnsParam,
    groupBy,
    color,
    baseline: baselineChoice,
    subprojects,
  } = Route.useSearch();
  const navigate = useNavigate();

  // Las condiciones viven en la URL y no en estado local: un tablero filtrado
  // tiene que poder pegarse en un mensaje, y es lo que la tabla `view` de esta
  // misma fase acabara guardando.
  const conditions = useMemo<EditableCondition[]>(
    () => filterParam ?? [],
    [filterParam],
  );

  const setConditions = useCallback(
    (next: EditableCondition[]) => {
      navigate({
        to: ".",
        search: (previous: TableSearchParams) => ({
          ...previous,
          filter: next.length > 0 ? next : undefined,
        }),
        replace: true,
      });
    },
    [navigate],
  );

  const filter = useMemo(() => buildFilter(conditions), [conditions]);

  const queryOptions = useMemo(
    () => ({
      treeScope:
        treeMode === "roots"
          ? ("roots" as const)
          : treeMode === "withDescendants"
            ? ("withDescendants" as const)
            : ("matching" as const),
      includeSubprojects: Boolean(subprojects),
    }),
    [treeMode, subprojects],
  );
  const {
    data: project,
    error,
    dataUpdatedAt,
  } = useGetTasks(projectId, filter, queryOptions);
  const { data: totals } = useTaskTotals(
    projectId,
    filter,
    queryOptions,
    dataUpdatedAt,
  );
  const { data: baselineData } = useTaskBaseline({
    projectId,
    workspaceId,
    choice: baselineChoice,
    filter,
    options: queryOptions,
    listUpdatedAt: dataUpdatedAt,
  });
  const baseline = useMemo(
    () =>
      baselineChoice && baselineData ? toViewBaseline(baselineData) : null,
    [baselineChoice, baselineData],
  );
  const { data: definitions = [] } = useGetFieldDefinitions(projectId);
  const { data: workspaceUsers } = useGetActiveWorkspaceUsers(workspaceId);
  const { data: views = [] } = useGetViews(projectId, "table");
  const filterableFields = useFilterableFields(projectId, workspaceId);
  const columnOptions = useMemo(
    () => availableColumns(definitions as FieldDefinition[], t),
    [definitions, t],
  );
  const visibleColumns = useMemo(
    () => resolveVisibleColumns(columnsParam, columnOptions),
    [columnsParam, columnOptions],
  );
  const { data: session } = authClient.useSession();
  const { mutate: saveView, isPending: isSavingView } = useSaveView(projectId);
  const { mutate: removeView } = useDeleteView(projectId);
  const [isAddFieldOpen, setIsAddFieldOpen] = useState(false);

  const { mutate: setCustomField } = useUpdateTaskCustomFields(projectId);
  const { mutate: createField, isPending: isCreatingField } =
    useCreateFieldDefinition(projectId);

  // Rellenar un valor es `task:update`; definir un campo de proyecto es
  // `project:update`, que hoy solo tienen admin y owner. Por eso son dos
  // capacidades distintas y no una.
  const { canUpdateTasks, canUpdateProjects } = useWorkspacePermission();
  const canEditValues = canUpdateTasks();
  const canDefineFields = canUpdateProjects();

  // La tabla trabaja sobre una lista plana y reconstruye el arbol por su
  // cuenta; el proyecto llega repartido en columnas.
  const tasks = useMemo<Task[]>(() => {
    if (!project) return [];

    return [
      ...(project.columns ?? []).flatMap((column) => column.tasks ?? []),
      ...(project.plannedTasks ?? []),
      ...subprojectTasks(project),
    ];
  }, [project]);
  // Los estados de un subproyecto son sus columnas, no las del padre.
  const statusColumns = useMemo(
    () => [...(project?.columns ?? []), ...subprojectColumns(project)],
    [project],
  );

  // Los campos de tipo `usuario` eligen de aqui. Se aplanan a lo minimo que la
  // celda necesita para no acoplarla a la forma de la respuesta.
  const members = useMemo(
    () =>
      (workspaceUsers?.members ?? []).map((member) => ({
        id: member.userId,
        name: member.user?.name ?? "",
        image: member.user?.image ?? null,
      })),
    [workspaceUsers],
  );

  // Aplicar una vista es navegar: su `config` es la misma busqueda que ya
  // vive en la URL, asi que cargarla no necesita ningun estado aparte.
  const handleApplyView = useCallback(
    (view: SavedView) => {
      navigate({
        to: ".",
        search: {
          filter: Array.isArray(view.config.filter)
            ? (view.config.filter as EditableCondition[])
            : undefined,
          treeMode: (view.config.treeMode as TreeMode | undefined) ?? undefined,
          columns: Array.isArray(view.config.columns)
            ? (view.config.columns as string[])
            : undefined,
          groupBy: GROUP_BYS.includes(view.config.groupBy as GroupBy)
            ? (view.config.groupBy as GroupBy)
            : undefined,
          color: ROW_COLORINGS.includes(view.config.color as RowColoring)
            ? (view.config.color as RowColoring)
            : undefined,
          baseline: isBaselineChoice(view.config.baseline)
            ? view.config.baseline
            : undefined,
          subprojects: view.config.subprojects === true ? true : undefined,
          viewId: view.id,
        },
        replace: true,
      });
    },
    [navigate],
  );

  const handleSaveView = useCallback(
    (name: string, isShared: boolean, onSaved: () => void) => {
      saveView(
        {
          name,
          type: "table",
          isShared,
          // Se guarda la busqueda tal cual: lo que se ve es lo que se guarda.
          config: {
            ...(conditions.length > 0 ? { filter: conditions } : {}),
            ...(treeMode !== "tree" ? { treeMode } : {}),
            ...(columnsParam ? { columns: columnsParam } : {}),
            ...(groupBy ? { groupBy } : {}),
            ...(color ? { color } : {}),
            ...(baselineChoice ? { baseline: baselineChoice } : {}),
            ...(subprojects ? { subprojects: true } : {}),
          },
        },
        {
          onSuccess: () => {
            onSaved();
            toast.success(t("tasks:table.views.saved"));
          },
          onError: (error) =>
            toast.error(
              error instanceof Error
                ? error.message
                : t("tasks:table.views.saveFailed"),
            ),
        },
      );
    },
    [
      saveView,
      conditions,
      treeMode,
      columnsParam,
      groupBy,
      color,
      baselineChoice,
      subprojects,
      t,
    ],
  );

  const handleOpenTask = useCallback(
    (id: string) => {
      navigate({
        to: ".",
        search: (previous: TableSearchParams) => ({
          ...previous,
          taskId: id,
        }),
        replace: true,
      });
    },
    [navigate],
  );

  const handleCloseTaskSheet = useCallback(() => {
    navigate({
      to: ".",
      search: (previous: TableSearchParams) => ({
        ...previous,
        taskId: undefined,
      }),
      replace: true,
    });
  }, [navigate]);

  const handleSetCustomField = useCallback(
    (id: string, key: string, value: unknown) => {
      setCustomField(
        { taskId: id, values: { [key]: value } },
        {
          onError: (error) => {
            toast.error(
              error instanceof Error
                ? error.message
                : t("tasks:table.saveFailed"),
            );
          },
        },
      );
    },
    [setCustomField, t],
  );

  const handleCreateField = useCallback(
    (field: AddFieldPayload) => {
      createField(field, {
        onSuccess: () => {
          setIsAddFieldOpen(false);
          toast.success(t("tasks:table.fieldCreated"));
        },
        onError: (error) => {
          toast.error(
            error instanceof Error
              ? error.message
              : t("tasks:table.fieldCreateFailed"),
          );
        },
      });
    },
    [createField, t],
  );

  return (
    <ProjectLayout
      projectId={projectId}
      workspaceId={workspaceId}
      activeView="table"
    >
      <PageTitle title={t("tasks:table.pageTitle", { name: project?.name })} />
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-card">
        <div className="border-border/80 border-b">
          <div className="flex flex-wrap items-center gap-1 px-3 pt-2">
            <ColumnPicker
              options={columnOptions}
              visible={visibleColumns}
              onToggle={(id) =>
                navigate({
                  to: ".",
                  search: (previous: TableSearchParams) => ({
                    ...previous,
                    columns: toggleColumn(columnsParam, columnOptions, id),
                  }),
                  replace: true,
                })
              }
            />
            <Select
              value={groupBy ?? "none"}
              onValueChange={(next) =>
                navigate({
                  to: ".",
                  search: (previous: TableSearchParams) => ({
                    ...previous,
                    groupBy: next === "epic" ? ("epic" as const) : undefined,
                  }),
                  replace: true,
                })
              }
            >
              <SelectTrigger
                size="sm"
                className="h-6 w-auto gap-1.5 border-0 bg-transparent px-2 text-xs shadow-none"
                aria-label={t("tasks:table.groupBy.label")}
              >
                <SelectValue>
                  {t("tasks:table.groupBy.label")}:{" "}
                  {t(`tasks:table.groupBy.${groupBy ?? "none"}`)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">
                  {t("tasks:table.groupBy.none")}
                </SelectItem>
                <SelectItem value="epic">
                  {t("tasks:table.groupBy.epic")}
                </SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={color ?? "none"}
              onValueChange={(next) =>
                navigate({
                  to: ".",
                  search: (previous: TableSearchParams) => ({
                    ...previous,
                    color: ROW_COLORINGS.includes(next as RowColoring)
                      ? (next as RowColoring)
                      : undefined,
                  }),
                  replace: true,
                })
              }
            >
              <SelectTrigger
                size="sm"
                className="h-6 w-auto gap-1.5 border-0 bg-transparent px-2 text-xs shadow-none"
                aria-label={t("tasks:table.color.label")}
                data-testid="table-color"
              >
                <SelectValue>
                  {t("tasks:table.color.label")}:{" "}
                  {t(`tasks:table.color.${color ?? "none"}`)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">
                  {t("tasks:table.color.none")}
                </SelectItem>
                <SelectItem value="priority">
                  {t("tasks:table.color.priority")}
                </SelectItem>
                <SelectItem value="due">
                  {t("tasks:table.color.due")}
                </SelectItem>
              </SelectContent>
            </Select>
            <SubprojectToggle
              count={project?.subprojectCount ?? 0}
              checked={Boolean(subprojects)}
              onChange={(next) =>
                navigate({
                  to: ".",
                  search: (previous: TableSearchParams) => ({
                    ...previous,
                    subprojects: next ? true : undefined,
                  }),
                  replace: true,
                })
              }
            />
            <BaselinePicker
              value={baselineChoice}
              onChange={(next) =>
                navigate({
                  to: ".",
                  search: (previous: TableSearchParams) => ({
                    ...previous,
                    baseline: next,
                  }),
                  replace: true,
                })
              }
            />
            <ViewPicker
              views={views as SavedView[]}
              activeViewId={viewId}
              currentUserId={session?.user?.id}
              canSave={
                conditions.length > 0 ||
                treeMode !== "tree" ||
                Boolean(columnsParam) ||
                Boolean(groupBy) ||
                Boolean(color) ||
                Boolean(baselineChoice) ||
                Boolean(subprojects)
              }
              saving={isSavingView}
              onApply={handleApplyView}
              onSave={handleSaveView}
              onDelete={(id) =>
                removeView(id, {
                  onError: (error) =>
                    toast.error(
                      error instanceof Error ? error.message : "Error",
                    ),
                })
              }
            />
          </div>
          <FilterBar
            fields={filterableFields}
            conditions={conditions}
            onChange={setConditions}
            treeMode={treeMode}
            onTreeModeChange={(next) =>
              navigate({
                to: ".",
                search: (previous: TableSearchParams) => ({
                  ...previous,
                  treeMode: next === "tree" ? undefined : next,
                }),
                replace: true,
              })
            }
          />
          <ProjectSizeWarning project={project} />
          {error && (
            <p className="px-3 pb-2 text-destructive text-xs">
              {error instanceof Error
                ? error.message
                : t("tasks:table.filterFailed")}
            </p>
          )}
        </div>
        <TableView
          tasks={tasks}
          definitions={definitions as FieldDefinition[]}
          members={members}
          columns={statusColumns}
          flatten={treeMode === "flat"}
          visibleColumns={visibleColumns}
          groupBy={groupBy}
          coloring={color}
          totals={totals}
          baseline={baseline}
          canEdit={canEditValues}
          onOpenTask={handleOpenTask}
          onSetCustomField={handleSetCustomField}
          onAddField={
            canDefineFields ? () => setIsAddFieldOpen(true) : undefined
          }
        />
      </div>

      <AddFieldDialog
        open={isAddFieldOpen}
        pending={isCreatingField}
        onClose={() => setIsAddFieldOpen(false)}
        onCreate={handleCreateField}
      />

      <TaskDetailsSheet
        taskId={taskId}
        projectId={projectId}
        workspaceId={workspaceId}
        onClose={handleCloseTaskSheet}
      />
    </ProjectLayout>
  );
}
