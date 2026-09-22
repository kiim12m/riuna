import { createFileRoute } from "@tanstack/react-router";
import { CalendarCheck } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import WorkspaceLayout from "@/components/common/workspace-layout";
import { WidgetTaskRow } from "@/components/dashboard/widget-task-row";
import PageTitle from "@/components/page-title";
import TaskDetailsSheet from "@/components/task/task-details-sheet";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import type { MyWorkTask } from "@/fetchers/my-work";
import { useSearchMyWork } from "@/hooks/queries/my-work/use-search-my-work";
import {
  DUE_WINDOW_ORDER,
  type DueWindow,
  getDueWindow,
} from "@/lib/due-window";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/today",
)({
  component: TodayComponent,
});

function groupByDueWindow(
  tasks: MyWorkTask[],
): Record<DueWindow, MyWorkTask[]> {
  const groups: Record<DueWindow, MyWorkTask[]> = {
    overdue: [],
    today: [],
    week: [],
    later: [],
    none: [],
  };
  for (const task of tasks) {
    groups[getDueWindow(task.dueDate)].push(task);
  }
  return groups;
}

/**
 * La pantalla de entrada: lo asignado a mi, en todos los proyectos, repartido
 * por ventana de vencimiento.
 *
 * Composicion pura sobre `GET /my-work/tasks/search` (ADR 037): sin filtro,
 * sin agrupar por nada que el registro del espacio no ofrezca (ADR 038). El
 * detalle se abre en el mismo panel lateral que tablero y calendario, no en
 * una pagina aparte -- una tarea de otro proyecto no tiene por que sacarte de
 * aqui.
 */
function TodayComponent() {
  const { t } = useTranslation();
  const { workspaceId } = Route.useParams();
  const { data, isPending } = useSearchMyWork(workspaceId);
  const [openTask, setOpenTask] = useState<{
    taskId: string;
    projectId: string;
  } | null>(null);

  const tasks = data?.tasks ?? [];
  const groups = groupByDueWindow(tasks);
  const windowsWithTasks = DUE_WINDOW_ORDER.filter(
    (window) => groups[window].length > 0,
  );

  return (
    <>
      <PageTitle title={t("today:pageTitle")} />
      <WorkspaceLayout title={t("today:pageTitle")}>
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
                  <CalendarCheck />
                </EmptyMedia>
                <EmptyTitle>{t("today:empty.title")}</EmptyTitle>
                <EmptyDescription>
                  {t("today:empty.description")}
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
