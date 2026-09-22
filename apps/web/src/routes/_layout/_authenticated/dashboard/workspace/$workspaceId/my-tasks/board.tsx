import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { SquareKanban } from "lucide-react";
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

type BoardSearchParams = {
  scope?: PersonalScope;
};

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/my-tasks/board",
)({
  component: RouteComponent,
  validateSearch: (search: Record<string, unknown>): BoardSearchParams => ({
    scope: search.scope === "team" ? "team" : undefined,
  }),
});

/**
 * "Mis tareas" › Tablero: carriles por ventana de vencimiento, no por estado
 * (`status`/`column` comparan contra un proyecto y mentirian en otro, ADR
 * 038). Sin arrastre en esta iteracion: un carril de vencimiento no tiene un
 * "mover a" que signifique nada, y el destino que si lo tendria —el plan
 * personal— llega con el Planificador (ADR 039).
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

  return (
    <>
      <PageTitle title={t("myTasks:pageTitle")} />
      <WorkspaceLayout
        title={t("myTasks:pageTitle")}
        headerActions={
          <PersonalTasksTabs
            workspaceId={workspaceId}
            active="board"
            scope={scope}
            onScopeChange={(next) =>
              navigate({
                to: ".",
                search: (previous: BoardSearchParams) => ({
                  ...previous,
                  scope: next === "assigned" ? undefined : next,
                }),
                replace: true,
              })
            }
          />
        }
      >
        {isPending ? (
          <div className="flex gap-3 p-4">
            {["a", "b", "c"].map((key) => (
              <Skeleton key={key} className="h-64 w-64 shrink-0 rounded-lg" />
            ))}
          </div>
        ) : tasks.length === 0 ? (
          <Empty className="min-h-[50vh]">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SquareKanban />
              </EmptyMedia>
              <EmptyTitle>{t("myTasks:empty.title")}</EmptyTitle>
              <EmptyDescription>
                {t("myTasks:empty.description")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="flex h-full min-h-0 gap-3 overflow-x-auto p-4">
            {DUE_WINDOW_ORDER.map((window) => (
              <div
                key={window}
                className="flex h-full w-64 shrink-0 flex-col rounded-lg border border-border/60 bg-sidebar/40"
              >
                <div className="flex items-center justify-between px-2 py-2">
                  <h2 className="text-section">
                    {t(`panels:buckets.due.${window}`)}
                  </h2>
                  <span className="text-meta text-muted-foreground">
                    {groups[window].length}
                  </span>
                </div>
                <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-1.5 pb-2">
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
              </div>
            ))}
          </div>
        )}
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
