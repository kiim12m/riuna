import { createFileRoute } from "@tanstack/react-router";
import { Hourglass, Link2, Users } from "lucide-react";
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
import type { WaitingResponse } from "@/fetchers/my-work";
import { useWaiting } from "@/hooks/queries/my-work/use-waiting";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/my-tasks/waiting",
)({
  component: RouteComponent,
});

const LIMIT = 100;

/**
 * «Esperando a» (sub-bloque 1.4): lo que depende de otra persona. Lo que
 * delegue y sigue abierto, con a quien espero, y lo mio bloqueado por una
 * tarea ajena, con cual. Sin ambito de equipo: la pregunta es siempre «a
 * quien espero yo».
 */
function RouteComponent() {
  const { t } = useTranslation();
  const { workspaceId } = Route.useParams();
  const { data, isPending } = useWaiting(workspaceId);
  const [openTask, setOpenTask] = useState<{
    taskId: string;
    projectId: string;
  } | null>(null);

  const delegated = data?.delegated ?? [];
  const blocked = data?.blocked ?? [];
  const isEmpty = !isPending && delegated.length === 0 && blocked.length === 0;

  const open = (task: { id: string; projectId: string }) =>
    setOpenTask({ taskId: task.id, projectId: task.projectId });

  return (
    <>
      <PageTitle title={t("myTasks:pageTitle")} />
      <WorkspaceLayout
        title={t("myTasks:pageTitle")}
        headerActions={
          <PersonalTasksTabs workspaceId={workspaceId} active="waiting" />
        }
      >
        <div className="space-y-4 p-4">
          <PageHeading
            title={t("myTasks:waiting.title")}
            description={t("myTasks:waiting.description")}
          />
          {isPending ? (
            <div className="space-y-2">
              {["a", "b", "c"].map((key) => (
                <Skeleton key={key} className="h-10 w-full rounded-md" />
              ))}
            </div>
          ) : isEmpty ? (
            <Empty className="min-h-[50vh]">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Hourglass />
                </EmptyMedia>
                <EmptyTitle>{t("myTasks:waiting.empty.title")}</EmptyTitle>
                <EmptyDescription>
                  {t("myTasks:waiting.empty.description")}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="space-y-6">
              {delegated.length > 0 && (
                <WaitingSection
                  testId="waiting-delegated"
                  title={t("myTasks:waiting.delegated", {
                    count: delegated.length,
                  })}
                  capped={delegated.length >= LIMIT}
                >
                  {delegated.map((task, index) => (
                    <WidgetTaskRow
                      key={task.id}
                      task={task}
                      variant="list"
                      shaded={index % 2 === 0}
                      onOpen={() => open(task)}
                      trailing={
                        <WaitingNote icon={<Users className="size-3" />}>
                          {t("myTasks:waiting.waitingOn", {
                            names: task.assignees
                              .map((assignee) => assignee.name)
                              .join(", "),
                          })}
                        </WaitingNote>
                      }
                    />
                  ))}
                </WaitingSection>
              )}

              {blocked.length > 0 && (
                <WaitingSection
                  testId="waiting-blocked"
                  title={t("myTasks:waiting.blocked", {
                    count: blocked.length,
                  })}
                  capped={blocked.length >= LIMIT}
                >
                  {blocked.map((task, index) => (
                    <WidgetTaskRow
                      key={task.id}
                      task={task}
                      variant="list"
                      shaded={index % 2 === 0}
                      onOpen={() => open(task)}
                      trailing={
                        <WaitingNote icon={<Link2 className="size-3" />}>
                          {t("myTasks:waiting.blockedBy", {
                            tasks: blockersLabel(task.blockedBy),
                          })}
                        </WaitingNote>
                      }
                    />
                  ))}
                </WaitingSection>
              )}
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

function blockersLabel(
  blockers: WaitingResponse["blocked"][number]["blockedBy"],
) {
  return blockers
    .map((blocker) =>
      blocker.number === null
        ? blocker.title
        : `${blocker.projectSlug}-${blocker.number} ${blocker.title}`,
    )
    .join(", ");
}

function WaitingSection({
  testId,
  title,
  capped,
  children,
}: {
  testId: string;
  title: string;
  capped: boolean;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();

  return (
    <section data-testid={testId}>
      <h2 className="mb-1 text-section">{title}</h2>
      <div className="space-y-0.5">{children}</div>
      {capped && (
        <p className="mt-1 text-meta text-muted-foreground">
          {t("myTasks:waiting.capped", { limit: LIMIT })}
        </p>
      )}
    </section>
  );
}

function WaitingNote({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span className="ml-2 flex max-w-[40%] shrink-0 items-center gap-1 truncate text-meta text-muted-foreground">
      {icon}
      <span className="truncate">{children}</span>
    </span>
  );
}
