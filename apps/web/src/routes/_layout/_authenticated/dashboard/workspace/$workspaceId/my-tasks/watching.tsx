import { createFileRoute } from "@tanstack/react-router";
import { Eye, Users } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PageHeading } from "@/components/common/page-heading";
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
import { useWatching } from "@/hooks/queries/my-work/use-watching";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/my-tasks/watching",
)({
  component: RouteComponent,
});

const LIMIT = 100;

/**
 * «Observando» (ADR 076): lo que sigo sin tenerlo asignado, lo ultimo que se
 * movio primero, con quien lo tiene. Sin ambito de equipo, como «Esperando a».
 */
function RouteComponent() {
  const { t } = useTranslation();
  const { workspaceId } = Route.useParams();
  const { data, isPending } = useWatching(workspaceId);
  const [openTask, setOpenTask] = useState<{
    taskId: string;
    projectId: string;
  } | null>(null);

  const tasks = data?.tasks ?? [];

  return (
    <>
      <PageTitle title={t("myTasks:pageTitle")} />
      <WorkspaceLayout
        title={t("myTasks:pageTitle")}
        headerActions={
          <PersonalTasksTabs workspaceId={workspaceId} active="watching" />
        }
      >
        <div className="space-y-4 p-4">
          <PageHeading
            title={t("myTasks:watching.title")}
            description={t("myTasks:watching.description")}
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
                  <Eye />
                </EmptyMedia>
                <EmptyTitle>{t("myTasks:watching.empty.title")}</EmptyTitle>
                <EmptyDescription>
                  {t("myTasks:watching.empty.description")}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <section data-testid="watching-list">
              <div className="space-y-0.5">
                {tasks.map((task, index) => (
                  <WidgetTaskRow
                    key={task.id}
                    task={task}
                    variant="list"
                    shaded={index % 2 === 0}
                    onOpen={() =>
                      setOpenTask({
                        taskId: task.id,
                        projectId: task.projectId,
                      })
                    }
                    trailing={
                      <span className="ml-2 flex max-w-[40%] shrink-0 items-center gap-1 truncate text-meta text-muted-foreground">
                        <Users className="size-3" />
                        <span className="truncate">
                          {task.assignees.length > 0
                            ? t("myTasks:watching.assignedTo", {
                                names: task.assignees
                                  .map((assignee) => assignee.name)
                                  .join(", "),
                              })
                            : t("myTasks:watching.unassigned")}
                        </span>
                      </span>
                    }
                  />
                ))}
              </div>
              {tasks.length >= LIMIT && (
                <p className="mt-1 text-meta text-muted-foreground">
                  {t("myTasks:watching.capped", { limit: LIMIT })}
                </p>
              )}
            </section>
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
