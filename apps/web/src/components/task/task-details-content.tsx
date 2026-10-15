import { useNavigate } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import Activity from "@/components/activity";
import CommentInput from "@/components/activity/comment-input";
import { isCommentActivity } from "@/components/activity/utils";
import { ExternalLinksAccordion } from "@/components/external-links/external-links-accordion";
import useAuth from "@/components/providers/auth-provider/hooks/use-auth";
import { TaskTimerButton } from "@/components/timer/task-timer-button";
import { Timeline } from "@/components/ui/timeline";
import useGetActivitiesByTaskId from "@/hooks/queries/activity/use-get-activities-by-task-id";
import useExternalLinks from "@/hooks/queries/external-link/use-external-links";
import { useGetFieldDefinitions } from "@/hooks/queries/field/use-get-field-definitions";
import useGetProject from "@/hooks/queries/project/use-get-project";
import useGetTask from "@/hooks/queries/task/use-get-task";
import type { ExternalLink } from "@/types/external-link";
import type { FieldDefinition } from "../table-view/custom-field-cell";
import TaskCustomFields from "./task-custom-fields";
import TaskDescription from "./task-description";
import TaskManualActions from "./task-manual-actions";
import TaskRelations from "./task-relations";
import TaskScheduleAlert from "./task-schedule-alert";
import TaskSubtasks from "./task-subtasks";
import TaskTime from "./task-time";
import TaskTitle from "./task-title";
import TaskTree from "./task-tree";
import TaskWikiLinks from "./task-wiki-links";

type TaskDetailsContentProps = {
  taskId: string | undefined;
  projectId: string;
  workspaceId: string;
  className?: string;
  /**
   * Pinta los campos personalizados como seccion del cuerpo. Lo pide quien no
   * los tiene ya en la columna de propiedades: el cajon, y la pagina completa
   * por debajo de `lg`.
   */
  showCustomFields?: boolean;
};

export default function TaskDetailsContent({
  taskId,
  projectId,
  workspaceId,
  className,
  showCustomFields = false,
}: TaskDetailsContentProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: task } = useGetTask(taskId ?? "");
  const { data: project } = useGetProject({ id: projectId, workspaceId });
  const { data: activities = [] } = useGetActivitiesByTaskId(taskId ?? "");
  // Con los archivados: un cambio antiguo puede ser de un campo que ya no se usa.
  const { data: fieldDefinitions } = useGetFieldDefinitions(projectId, {
    includeArchived: true,
  });
  const { data: externalLinks = [], isLoading: isLoadingExternalLinks } =
    useExternalLinks(taskId ?? "");
  const { user } = useAuth();

  // El padre llega con el detalle: la jerarquia ya no se deduce cruzando
  // relaciones.
  const parentTask = task?.parent ?? null;

  if (!taskId) return null;

  return (
    <div className={`${className} gap-4`}>
      <div className="flex flex-col gap-2.5">
        {parentTask && (
          <button
            type="button"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-fit"
            onClick={() =>
              navigate({
                to: "/dashboard/workspace/$workspaceId/project/$projectId/task/$taskId",
                params: {
                  workspaceId,
                  projectId,
                  taskId: parentTask.id,
                },
              })
            }
          >
            <ArrowUpRight className="size-3" />
            <span>
              {t("tasks:detail.subtaskOf")}{" "}
              <span className="font-medium">{parentTask.title}</span>
            </span>
          </button>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-semibold text-foreground/70">
            {project?.slug}-{task?.number}
          </p>
          {/* Un hito no dura, asi que ni cronometro ni estimacion (ADR 082). */}
          {task && !task.isMilestone && (
            <TaskTimerButton
              task={{
                id: task.id,
                number: task.number ?? null,
                title: task.title,
                projectId,
                estimate: task.estimate ?? null,
                // "Hecha" es `completed_at`, una sola definicion (ADR 030).
                isDone: Boolean(task.completedAt),
              }}
            />
          )}
          {task && <TaskManualActions taskId={task.id} />}
        </div>
        <TaskTitle taskId={taskId} />
        {task && <TaskScheduleAlert task={task} />}
        <TaskDescription taskId={taskId} workspaceId={workspaceId} />
      </div>
      <TaskWikiLinks taskId={taskId} workspaceId={workspaceId} />
      {showCustomFields && task && (
        <TaskCustomFields
          task={task}
          projectId={projectId}
          workspaceId={workspaceId}
          variant="section"
          className="mt-4"
        />
      )}
      {!isLoadingExternalLinks && externalLinks.length > 0 && (
        <div className="mt-4">
          <ExternalLinksAccordion
            externalLinks={externalLinks as ExternalLink[]}
            isLoading={isLoadingExternalLinks}
          />
        </div>
      )}
      {task && (
        <div className="mt-4">
          <TaskTree taskId={taskId} projectId={projectId} />
        </div>
      )}
      {task && !task.isMilestone && (
        <div className="mt-4">
          <TaskTime
            taskId={taskId}
            workspaceId={workspaceId}
            estimate={task.estimate ?? null}
          />
        </div>
      )}
      <div className="mt-4">
        {task && !task.isMilestone && (
          <TaskSubtasks
            taskId={taskId}
            projectId={projectId}
            workspaceId={workspaceId}
            parentStatus={task.status}
          />
        )}
      </div>
      <div className="mt-2">
        <TaskRelations
          taskId={taskId}
          projectId={projectId}
          workspaceId={workspaceId}
        />
      </div>
      <span className="text-sm font-medium text-muted-foreground h-[1px] bg-border w-full block shrink-0" />
      <div className="flex flex-col gap-4">
        {/* `h2`: es una seccion de la tarea, no el titulo de la pagina. Y
            `text-md` no existe en Tailwind, asi que esa clase no pintaba nada. */}
        <h2 className="text-section">{t("tasks:detail.activity")}</h2>
        {user?.id && taskId && <CommentInput taskId={taskId} />}
        {activities.length > 0 ? (
          <Timeline>
            {activities.map((activity, index) => {
              const nextActivity = activities[index + 1];
              const showConnector =
                !isCommentActivity(activity) &&
                Boolean(nextActivity) &&
                !isCommentActivity(nextActivity);

              return (
                <Activity
                  key={activity.id}
                  activity={activity}
                  step={activities.length - index}
                  showConnector={showConnector}
                  fieldDefinitions={
                    fieldDefinitions as FieldDefinition[] | undefined
                  }
                />
              );
            })}
          </Timeline>
        ) : (
          <p className="text-sm font-medium text-muted-foreground">
            {t("tasks:detail.noActivity")}
          </p>
        )}
      </div>
    </div>
  );
}
