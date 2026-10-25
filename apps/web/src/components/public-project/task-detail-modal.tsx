import { Calendar, CalendarClock, CalendarX, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogClose, DialogPopup } from "@/components/ui/dialog";
import {
  dueDateStatusColors,
  getDueDateStatus,
  isTaskCompleted,
} from "@/lib/due-date-status";
import { formatDateMedium, formatDateShort } from "@/lib/format";
import { getInitials } from "@/lib/get-initials";
import { getPriorityIcon } from "@/lib/priority";
import type { PublicTask } from "@/types/project";
import { MarkdownRenderer } from "./markdown-renderer";
import { PublicTaskLabels } from "./public-task-labels";

type PublicTaskDetailModalProps = {
  task:
    | (PublicTask & {
        labels?: Array<{ id: string; name: string; color: string }>;
      })
    | null;
  projectSlug: string;
  // The modal is opened from any column, so it resolves completion by slug
  // rather than being told; without these it falls back to the slug heuristic.
  columns?: Array<{ slug: string; isFinal: boolean }>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function PublicTaskDetailModal({
  task,
  projectSlug,
  columns,
  open,
  onOpenChange,
}: PublicTaskDetailModalProps) {
  const taskIsCompleted = isTaskCompleted(task?.status ?? "", columns);
  const { t } = useTranslation();

  if (!task) return null;

  const labels = task.labels || [];

  const statusLabel = task.status ? t(`tasks:status.${task.status}`) : "";
  const priorityLabel =
    task.priority != null && task.priority !== ""
      ? t(`tasks:priority.${task.priority}`)
      : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="w-full max-w-4xl max-h-[85vh] p-0">
        <div className="bg-background border border-border rounded-xl flex flex-col max-h-[85vh] shadow-lg">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/70 shrink-0">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="text-sm font-medium text-muted-foreground shrink-0">
                {projectSlug.toUpperCase()}-{task.number}
              </span>
              {statusLabel ? (
                <span className="text-xs text-muted-foreground px-1.5 py-0.5 bg-muted rounded-md shrink-0">
                  {statusLabel}
                </span>
              ) : null}
            </div>
            <DialogClose
              className="shrink-0 p-1.5 hover:bg-muted rounded transition-colors"
              render={<button type="button" />}
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </DialogClose>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
            <div className="space-y-3">
              <h2 className="pr-8 text-page font-heading text-foreground">
                {task.title}
              </h2>

              <div className="flex flex-wrap gap-2">
                {task.priority && priorityLabel && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-muted text-muted-foreground rounded-md">
                    {getPriorityIcon(task.priority)}
                    <span>{priorityLabel}</span>
                  </div>
                )}

                {task.dueDate && (
                  <div
                    className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md ${dueDateStatusColors[getDueDateStatus(task.dueDate, taskIsCompleted)]}`}
                  >
                    {getDueDateStatus(task.dueDate, taskIsCompleted) ===
                      "overdue" && <CalendarX className="w-3 h-3" />}
                    {getDueDateStatus(task.dueDate, taskIsCompleted) ===
                      "due-soon" && <CalendarClock className="w-3 h-3" />}
                    {(getDueDateStatus(task.dueDate, taskIsCompleted) ===
                      "far-future" ||
                      getDueDateStatus(task.dueDate, taskIsCompleted) ===
                        "no-due-date") && <Calendar className="w-3 h-3" />}
                    <span>
                      {t("publicProject:taskDetail.dueWithDate", {
                        date: formatDateShort(task.dueDate),
                      })}
                    </span>
                  </div>
                )}

                {task.assigneeName && (
                  <div className="flex items-center gap-2 px-2.5 py-1 text-xs bg-muted text-muted-foreground rounded-md">
                    <Avatar className="h-4 w-4">
                      <AvatarImage
                        src={task.assigneeImage ?? ""}
                        alt={task.assigneeName ?? ""}
                      />
                      <AvatarFallback className="text-label">
                        {getInitials(task.assigneeName)}
                      </AvatarFallback>
                    </Avatar>
                    <span>{task.assigneeName}</span>
                  </div>
                )}
              </div>
            </div>

            {task.description && (
              <div className="pt-1">
                <MarkdownRenderer content={task.description} />
              </div>
            )}

            {labels.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {t("publicProject:taskDetail.labels")}
                </h3>
                <PublicTaskLabels labels={labels} />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border/50">
              <div>
                <div className="text-xs text-muted-foreground mb-1">
                  {t("publicProject:taskDetail.created")}
                </div>
                <div className="text-sm text-foreground">
                  {task.createdAt ? formatDateMedium(task.createdAt) : "—"}
                </div>
              </div>
              {task.dueDate && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">
                    {t("publicProject:taskDetail.dueDateLabel")}
                  </div>
                  <div className="text-sm text-foreground">
                    {formatDateMedium(task.dueDate)}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogPopup>
    </Dialog>
  );
}
