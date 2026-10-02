import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { List as ListIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PageHeading } from "@/components/common/page-heading";
import WorkspaceLayout from "@/components/common/workspace-layout";
import { WidgetTaskRow } from "@/components/dashboard/widget-task-row";
import PageTitle from "@/components/page-title";
import { LoadMore } from "@/components/personal-tasks/load-more";
import { PersonalTasksTabs } from "@/components/personal-tasks/tabs";
import TaskDetailsSheet from "@/components/task/task-details-sheet";
import { TaskTimerButton } from "@/components/timer/task-timer-button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import type { PersonalScope } from "@/fetchers/my-work";
import { useMyTasksPages } from "@/hooks/queries/my-work/use-search-my-work";
import { DUE_WINDOW_ORDER, groupByDueWindow } from "@/lib/due-window";

type ListSearchParams = {
  scope?: PersonalScope;
};

/** Lo mismo que pedia antes de una vez; ahora es una pagina. */
const PAGE_SIZE = 100;

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/my-tasks/list",
)({
  component: RouteComponent,
  validateSearch: (search: Record<string, unknown>): ListSearchParams => ({
    scope: search.scope === "team" ? "team" : undefined,
  }),
});

/**
 * "Mis tareas" › Lista: version plana, sin arbol —`parent`/`depth` estan
 * fuera del registro del espacio (ADR 038)— agrupada por ventana de
 * vencimiento igual que "Hoy". Lo que la diferencia de "Hoy" es el ambito
 * elegible: aqui tambien se puede mirar lo del equipo, no solo lo propio.
 */
function RouteComponent() {
  const { t } = useTranslation();
  const { workspaceId } = Route.useParams();
  const { scope = "assigned" } = Route.useSearch();
  const navigate = useNavigate();

  const { data, isPending, fetchNextPage, isFetchingNextPage } =
    useMyTasksPages({
      workspaceId,
      scope,
      sortBy: "smart",
      limit: PAGE_SIZE,
    });

  const [openTask, setOpenTask] = useState<{
    taskId: string;
    projectId: string;
  } | null>(null);

  const tasks = data?.pages.flatMap((page) => page.tasks) ?? [];
  const pagination = data?.pages.at(-1)?.pagination;
  const groups = groupByDueWindow(tasks, (task) => task.dueWindow);
  const windowsWithTasks = DUE_WINDOW_ORDER.filter(
    (window) => groups[window].length > 0,
  );

  return (
    <>
      <PageTitle title={t("myTasks:pageTitle")} />
      <WorkspaceLayout
        title={t("myTasks:pageTitle")}
        headerActions={
          <PersonalTasksTabs
            workspaceId={workspaceId}
            active="list"
            scope={scope}
            onScopeChange={(next) =>
              navigate({
                to: ".",
                search: (previous: ListSearchParams) => ({
                  ...previous,
                  scope: next === "assigned" ? undefined : next,
                }),
                replace: true,
              })
            }
          />
        }
      >
        <div className="space-y-4 p-4">
          <PageHeading
            title={t("myTasks:pageTitle")}
            description={t("myTasks:description")}
          />
          {isPending ? (
            <div className="space-y-2">
              {["a", "b", "c"].map((key) => (
                <Skeleton key={key} className="h-10 w-full rounded-md" />
              ))}
            </div>
          ) : tasks.length === 0 ? (
            <Empty className="min-h-[50vh]">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ListIcon />
                </EmptyMedia>
                <EmptyTitle>{t("myTasks:empty.title")}</EmptyTitle>
                <EmptyDescription>
                  {t("myTasks:empty.description")}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="space-y-6">
              {windowsWithTasks.map((window) => (
                <section key={window}>
                  <h2 className="mb-1 text-section">
                    {t(`panels:buckets.due.${window}`)}
                  </h2>
                  <div className="space-y-0.5">
                    {groups[window].map((task, index) => (
                      <WidgetTaskRow
                        key={task.id}
                        task={task}
                        variant="list"
                        shaded={index % 2 === 0}
                        trailing={
                          <TaskTimerButton task={task} reveal="hover" />
                        }
                        onOpen={() =>
                          setOpenTask({
                            taskId: task.id,
                            projectId: task.projectId,
                          })
                        }
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
          {pagination && (
            <LoadMore
              shown={tasks.length}
              total={pagination.total}
              totalIsCapped={pagination.totalIsCapped}
              hasMore={pagination.hasMore}
              isLoading={isFetchingNextPage}
              onLoadMore={() => fetchNextPage()}
            />
          )}
        </div>
      </WorkspaceLayout>

      <TaskDetailsSheet
        taskId={openTask?.taskId}
        projectId={openTask?.projectId ?? ""}
        workspaceId={workspaceId}
        onClose={() => setOpenTask(null)}
      />
    </>
  );
}
