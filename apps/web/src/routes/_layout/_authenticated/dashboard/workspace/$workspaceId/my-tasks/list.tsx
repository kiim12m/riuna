import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { List as ListIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import WorkspaceLayout from "@/components/common/workspace-layout";
import { WidgetTaskRow } from "@/components/dashboard/widget-task-row";
import PageTitle from "@/components/page-title";
import { PersonalTasksTabs } from "@/components/personal-tasks/tabs";
import TaskDetailsSheet from "@/components/task/task-details-sheet";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import type { PersonalScope } from "@/fetchers/my-work";
import { useMyTasksSearch } from "@/hooks/queries/my-work/use-search-my-work";
import { DUE_WINDOW_ORDER, groupByDueWindow } from "@/lib/due-window";

type ListSearchParams = {
  scope?: PersonalScope;
};

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

  const { data, isPending } = useMyTasksSearch({
    workspaceId,
    scope,
    sortBy: "smart",
  });

  const [openTask, setOpenTask] = useState<{
    taskId: string;
    projectId: string;
  } | null>(null);

  const tasks = data?.tasks ?? [];
  const groups = groupByDueWindow(tasks, (task) => task.dueDate);
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
        <div className="p-4">
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
                    {groups[window].map((task) => (
                      <WidgetTaskRow
                        key={task.id}
                        task={task}
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
