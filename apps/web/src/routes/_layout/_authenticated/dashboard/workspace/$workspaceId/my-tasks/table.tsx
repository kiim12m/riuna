import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { PageHeading } from "@/components/common/page-heading";
import WorkspaceLayout from "@/components/common/workspace-layout";
import PageTitle from "@/components/page-title";
import { PersonalTasksTabs } from "@/components/personal-tasks/tabs";
import TableView from "@/components/table-view";
import FilterBar from "@/components/table-view/filter-bar";
import ViewPicker, {
  type SavedView,
} from "@/components/table-view/view-picker";
import TaskDetailsSheet from "@/components/task/task-details-sheet";
import type { MyWorkTask, PersonalScope } from "@/fetchers/my-work";
import {
  useDeleteWorkspaceView,
  useSaveWorkspaceView,
} from "@/hooks/mutations/view/use-view-mutations";
import { useMyTasksSearch } from "@/hooks/queries/my-work/use-search-my-work";
import { useGetWorkspaceViews } from "@/hooks/queries/view/use-get-views";
import { useGetActiveWorkspaceUsers } from "@/hooks/queries/workspace-users/use-get-active-workspace-users";
import { useWorkspaceFilterableFields } from "@/hooks/use-workspace-filterable-fields";
import { authClient } from "@/lib/auth-client";
import { toast } from "@/lib/toast";
import type Task from "@/types/task";
import { buildFilter, type EditableCondition } from "@/types/task-filter";

type TableSearchParams = {
  taskId?: string;
  scope?: PersonalScope;
  filter?: EditableCondition[];
  viewId?: string;
};

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/my-tasks/table",
)({
  component: RouteComponent,
  validateSearch: (search: Record<string, unknown>): TableSearchParams => ({
    taskId: typeof search.taskId === "string" ? search.taskId : undefined,
    scope: search.scope === "team" ? "team" : undefined,
    filter: Array.isArray(search.filter)
      ? (search.filter as EditableCondition[])
      : undefined,
    viewId: typeof search.viewId === "string" ? search.viewId : undefined,
  }),
});

// El resto de la fila es opcional en `Task`; solo lo que la tabla realmente
// pinta necesita venir. Sin arbol entre proyectos, `parentId` es siempre
// nulo: cada tarea es su propia raiz (ADR 039).
function toTableTask(task: MyWorkTask): Task {
  const primaryAssignee =
    task.assignees.find((assignee) => assignee.id === task.userId) ?? null;

  return {
    id: task.id,
    title: task.title,
    number: task.number,
    description: null,
    status: task.status,
    priority: task.priority,
    startDate: task.startDate,
    dueDate: task.dueDate,
    position: 0,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    userId: task.userId,
    assigneeId: task.userId,
    assigneeName: primaryAssignee?.name ?? null,
    assigneeImage: primaryAssignee?.image ?? null,
    assignees: task.assignees,
    teamId: task.teamId,
    teamName: task.teamName,
    projectId: task.projectId,
    labels: task.labels,
    parentId: null,
    estimate: task.estimate,
    customFields: {},
  };
}

/**
 * "Mis tareas" › Tabla: la unica de las cuatro que no hizo falta tocar por
 * dentro (`TableView` no lee ningun store ni dispara ninguna mutacion). Sin
 * campos personalizados todavia —no hay endpoint que liste los de espacio
 * fuera del motor de filtros—, asi que llega sin columnas propias y de solo
 * lectura para su valor.
 */
function RouteComponent() {
  const { t } = useTranslation();
  const { workspaceId } = Route.useParams();
  const {
    taskId,
    scope = "assigned",
    filter: filterParam,
    viewId,
  } = Route.useSearch();
  const navigate = useNavigate();

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

  const { data, error, isPending } = useMyTasksSearch({
    workspaceId,
    scope,
    filter,
    sortBy: "smart",
    limit: 100,
  });
  const { data: workspaceUsers } = useGetActiveWorkspaceUsers(workspaceId);
  const { data: views = [] } = useGetWorkspaceViews(workspaceId, "table");
  const filterableFields = useWorkspaceFilterableFields(workspaceId);
  const { data: session } = authClient.useSession();
  const { mutate: saveView, isPending: isSavingView } =
    useSaveWorkspaceView(workspaceId);
  const { mutate: removeView } = useDeleteWorkspaceView(workspaceId);

  const tasks = useMemo(() => (data?.tasks ?? []).map(toTableTask), [data]);

  const members = useMemo(
    () =>
      (workspaceUsers?.members ?? []).map((member) => ({
        id: member.userId,
        name: member.user?.name ?? "",
        image: member.user?.image ?? null,
      })),
    [workspaceUsers],
  );

  const handleApplyView = useCallback(
    (view: SavedView) => {
      navigate({
        to: ".",
        search: {
          filter: Array.isArray(view.config.filter)
            ? (view.config.filter as EditableCondition[])
            : undefined,
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
          config: conditions.length > 0 ? { filter: conditions } : {},
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
    },
    [saveView, conditions, t],
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

  const openTask = tasks.find((task) => task.id === taskId);

  return (
    <>
      <PageTitle title={t("myTasks:pageTitle")} />
      <WorkspaceLayout
        title={t("myTasks:pageTitle")}
        headerActions={
          <PersonalTasksTabs
            workspaceId={workspaceId}
            active="table"
            scope={scope}
            onScopeChange={(next) =>
              navigate({
                to: ".",
                search: (previous: TableSearchParams) => ({
                  ...previous,
                  scope: next === "assigned" ? undefined : next,
                }),
                replace: true,
              })
            }
          />
        }
      >
        <div className="flex h-full min-h-0 flex-col overflow-hidden bg-card">
          <PageHeading
            title={t("myTasks:pageTitle")}
            description={t("myTasks:description")}
            className="px-4 pt-4 pb-1"
          />
          <div className="border-border/80 border-b">
            <div className="flex items-center gap-1 px-3 pt-2">
              <ViewPicker
                views={views as SavedView[]}
                activeViewId={viewId}
                currentUserId={session?.user?.id}
                canSave={conditions.length > 0}
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
            </div>
            <FilterBar
              fields={filterableFields}
              conditions={conditions}
              onChange={setConditions}
            />
            {data?.pagination.hasMore && (
              <p className="px-3 pb-2 text-meta text-muted-foreground">
                {t("myTasks:table.moreResults", {
                  shown: tasks.length,
                  total: data.pagination.totalIsCapped
                    ? `${data.pagination.total}+`
                    : data.pagination.total,
                })}
              </p>
            )}
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
            definitions={[]}
            members={members}
            columns={[]}
            flatten
            canEdit={false}
            onOpenTask={handleOpenTask}
            onSetCustomField={() => {}}
          />
        </div>
      </WorkspaceLayout>

      {!isPending && (
        <TaskDetailsSheet
          taskId={taskId}
          projectId={openTask?.projectId ?? ""}
          workspaceId={workspaceId}
          onClose={handleCloseTaskSheet}
        />
      )}
    </>
  );
}
