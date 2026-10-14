import { useTranslation } from "react-i18next";
import DueDatePill from "@/components/task/due-date-pill";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { isTaskCompleted } from "@/lib/due-date-status";
import { getInitials } from "@/lib/get-initials";
import { getPriorityIcon } from "@/lib/priority";
import type { PublicTask } from "@/types/project";
import { PublicPRBadge } from "./public-pr-badge";
import { PublicTaskLabels } from "./public-task-labels";

type PublicTaskRowProps = {
  task: PublicTask;
  projectSlug: string;
  // Passed by views that hold the column, so completion comes from isFinal
  // rather than the slug fallback.
  isCompleted?: boolean;
  onTaskClick: (task: PublicTask) => void;
};

export function PublicTaskRow({
  task,
  projectSlug,
  isCompleted,
  onTaskClick,
}: PublicTaskRowProps) {
  const taskIsCompleted = isCompleted ?? isTaskCompleted(task.status);
  const { t } = useTranslation();
  const labels = task.labels || [];
  const externalLinks = task.externalLinks || [];

  return (
    <button
      type="button"
      className="group w-full text-left px-4 py-3 rounded-lg flex items-center gap-4 bg-card border border-border shadow-sm hover:shadow-md transition-[background-color,border-color,box-shadow] duration-200 ease-out hover:border-border/70 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
      onClick={() => onTaskClick(task)}
      aria-label={t("publicProject:taskCard.viewDetailsAria", {
        title: task.title,
      })}
    >
      <div className="flex-1 min-w-0 flex items-center gap-3">
        <div className="text-xs font-mono text-muted-foreground shrink-0 font-medium">
          {projectSlug}-{task.number}
        </div>
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          <h3 className="text-sm font-medium text-foreground truncate">
            {task.title}
          </h3>
          {labels.length > 0 && <PublicTaskLabels labels={labels} />}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {task.assigneeName && (
          <div className="flex items-center gap-1.5">
            <Avatar className="h-5 w-5">
              <AvatarImage
                src={task.assigneeImage ?? ""}
                alt={task.assigneeName ?? ""}
              />
              <AvatarFallback className="text-label font-medium border border-border/30">
                {getInitials(task.assigneeName)}
              </AvatarFallback>
            </Avatar>
            <span className="text-xs text-muted-foreground font-medium">
              {task.assigneeName}
            </span>
          </div>
        )}

        {task.dueDate && (
          <DueDatePill dueDate={task.dueDate} isCompleted={taskIsCompleted} />
        )}

        {task.priority && (
          <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-border bg-sidebar text-label font-medium text-muted-foreground">
            {getPriorityIcon(task.priority)}
          </div>
        )}

        {externalLinks.length > 0 && (
          <PublicPRBadge externalLinks={externalLinks} />
        )}
      </div>
    </button>
  );
}
