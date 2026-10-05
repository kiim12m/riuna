import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { useReducedMotion } from "framer-motion";
import {
  Calendar,
  CalendarClock,
  CalendarX,
  GitMerge,
  GitPullRequest,
} from "lucide-react";
import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AssigneeStack } from "@/components/task/assignee-stack";
import { TaskTimerButton } from "@/components/timer/task-timer-button";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/preview-card";
import { useDeleteTask } from "@/hooks/mutations/task/use-delete-task";
import useActiveWorkspace from "@/hooks/queries/workspace/use-active-workspace";
import { cn } from "@/lib/cn";
import {
  dueDateStatusColors,
  getDueDateStatus,
  isTaskCompleted,
} from "@/lib/due-date-status";
import { getPriorityIcon } from "@/lib/priority";
import { toast } from "@/lib/toast";
import queryClient from "@/query-client";
import useBulkSelectionStore from "@/store/bulk-selection";
import useProjectStore from "@/store/project";
import useRealtimeHighlightStore from "@/store/realtime-highlight";
import { useUserPreferencesStore } from "@/store/user-preferences";
import type Task from "@/types/task";
import SubtaskBadge from "../task/subtask-badge";
import { Button } from "../ui/button";
import { ContextMenu, ContextMenuTrigger } from "../ui/context-menu";
import TaskCardContextMenuContent from "./task-card-context-menu/task-card-context-menu-content";
import { TaskLabels } from "./task-labels";

type TaskCardProps = {
  task: Task;
  disableDragDrop?: boolean;
};

function TaskCard({ task, disableDragDrop = false }: TaskCardProps) {
  const { t } = useTranslation();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, disabled: disableDragDrop });
  const { project } = useProjectStore();
  const taskIsCompleted = isTaskCompleted(task.status, project?.columns);
  const { data: workspace } = useActiveWorkspace();
  const { mutateAsync: deleteTask } = useDeleteTask();
  const navigate = useNavigate();
  const {
    showAssignees,
    showPriority,
    showDueDates,
    showLabels,
    showTaskNumbers,
  } = useUserPreferencesStore();
  const [isDeleteTaskModalOpen, setIsDeleteTaskModalOpen] = useState(false);
  const { toggleSelection, isSelected, isFocused } = useBulkSelectionStore();
  const isTaskSelected = isSelected(task.id);
  const isTaskFocused = isFocused(task.id);

  // Resalte cuando otra persona cambia esta tarea (marca §06 principio 5).
  const pulse = useRealtimeHighlightStore(
    (state) => state.pulses[task.id] ?? 0,
  );
  const reduceMotion = useReducedMotion();
  const [isFlashing, setIsFlashing] = useState(false);
  useEffect(() => {
    if (!pulse) return;
    setIsFlashing(true);
    const timeout = setTimeout(() => setIsFlashing(false), 900);
    return () => clearTimeout(timeout);
  }, [pulse]);
  let flashClass = "";
  if (isFlashing) {
    flashClass = reduceMotion ? "riuna-flash-static" : "animate-flux";
  }

  const pullRequests = useMemo(() => {
    return (task.externalLinks ?? []).filter(
      (link) => link.resourceType === "pull_request",
    );
  }, [task.externalLinks]);

  const getPRInfo = (pr: (typeof pullRequests)[number]) => {
    const isMerged = pr.metadata?.merged === true;
    const isDraft = pr.metadata?.draft === true;

    if (isMerged) {
      return {
        icon: <GitMerge className="h-3 w-3 text-info-foreground" />,
        status: t("tasks:pr.merged"),
        statusClass: "text-info-foreground",
      };
    }

    if (isDraft) {
      return {
        icon: <GitPullRequest className="h-3 w-3 text-muted-foreground" />,
        status: t("tasks:pr.draft"),
        statusClass: "text-muted-foreground",
      };
    }

    return {
      icon: <GitPullRequest className="h-3 w-3 text-success-foreground" />,
      status: t("tasks:pr.open"),
      statusClass: "text-success-foreground",
    };
  };

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition:
      transition || "transform 250ms cubic-bezier(0.25, 0.46, 0.45, 0.94)",
    opacity: isDragging ? 0.6 : 1,
    touchAction: isDragging ? "none" : "auto",
    zIndex: isDragging ? 999 : "auto",
  };

  function handleTaskCardClick(
    e: React.MouseEvent<HTMLDivElement> | React.KeyboardEvent<HTMLDivElement>,
  ) {
    if (!project || !task || !workspace) return;

    if ((e as React.MouseEvent).metaKey || (e as React.KeyboardEvent).ctrlKey) {
      toggleSelection(task.id);
      return;
    }

    const currentParams = new URLSearchParams(window.location.search);
    const currentTaskId = currentParams.get("taskId");

    if (currentTaskId === task.id) {
      navigate({
        to: ".",
        search: {},
      });
    } else {
      navigate({
        to: ".",
        search: { taskId: task.id },
      });
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      toggleSelection(task.id);
    }
  };

  const handleDeleteTask = async () => {
    try {
      await deleteTask(task.id);
      queryClient.invalidateQueries({
        queryKey: ["tasks", project?.id],
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("tasks:delete.error"),
      );
    } finally {
      toast.success(t("tasks:delete.success"));
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      tabIndex={-1}
    >
      <ContextMenu>
        <ContextMenuTrigger asChild>
          {/** biome-ignore lint/a11y/useSemanticElements: the card holds block-level content and cannot be a native <button> */}
          <div
            role="button"
            tabIndex={0}
            aria-label={task.title}
            onClick={handleTaskCardClick}
            className={`group relative rounded-lg border bg-background p-(--density-card-pad) shadow-xs/5 outline-none transition-[background-color,border-color,box-shadow,scale] duration-150 ease-out active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
              disableDragDrop ? "cursor-default" : "cursor-move"
            } ${
              isDragging
                ? "border-ring/40 bg-card shadow-lg"
                : "hover:border-brand/45 hover:shadow-sm"
            } ${
              isTaskSelected
                ? "border-ring/40 bg-accent/50 shadow-sm ring-1 ring-inset ring-ring/30"
                : "border-border"
            } ${isTaskFocused ? "ring-2 ring-inset ring-ring/50" : ""} ${flashClass}`}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleTaskCardClick(e);
              } else if (e.key === "Escape") {
                handleKeyDown(e);
              }
            }}
          >
            {showTaskNumbers && (
              <div className="mb-2 text-label font-mono text-muted-foreground/90">
                {project?.slug}-{task.number}
              </div>
            )}

            {showAssignees && (
              <div className="absolute top-(--density-card-pad) right-(--density-card-pad)">
                <AssigneeStack assignees={task.assignees ?? []} size="sm" />
              </div>
            )}

            <div
              className={cn(
                "mb-(--density-stack)",
                (task.assignees?.length ?? 0) > 1 ? "pr-12" : "pr-6",
              )}
            >
              <div
                className="overflow-hidden break-words leading-5 font-medium text-foreground/95 text-body"
                style={{
                  display: "-webkit-box",
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: "vertical",
                  wordBreak: "break-word",
                  hyphens: "auto",
                }}
              >
                {task.title}
              </div>
            </div>

            {showLabels && (
              <div className="mb-(--density-stack)">
                <TaskLabels labels={task.labels ?? []} />
              </div>
            )}

            <div className="flex items-center gap-(--density-gap)">
              <SubtaskBadge subtree={task.subtree} />
              {showPriority && (
                <span className="inline-flex items-center gap-1 rounded border border-border/70 bg-muted/55 px-2 py-1 text-label font-medium text-muted-foreground">
                  {getPriorityIcon(task.priority ?? "")}
                </span>
              )}

              {showDueDates && task.dueDate && (
                <div
                  className={`flex items-center gap-1 text-label px-2 py-1 rounded ${dueDateStatusColors[getDueDateStatus(task.dueDate, taskIsCompleted)]}`}
                >
                  {getDueDateStatus(task.dueDate, taskIsCompleted) ===
                    "overdue" && <CalendarX className="w-3 h-3" />}
                  {getDueDateStatus(task.dueDate, taskIsCompleted) ===
                    "due-soon" && <CalendarClock className="w-3 h-3" />}
                  {(getDueDateStatus(task.dueDate, taskIsCompleted) ===
                    "far-future" ||
                    getDueDateStatus(task.dueDate, taskIsCompleted) ===
                      "no-due-date") && <Calendar className="w-3 h-3" />}
                  <span>{format(new Date(task.dueDate), "MMM d")}</span>
                </div>
              )}

              {pullRequests.length === 1 && (
                <HoverCard openDelay={200} closeDelay={100}>
                  <HoverCardTrigger asChild>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(pullRequests[0].url, "_blank");
                      }}
                      className="inline-flex items-center gap-1.5 rounded border border-border/70 bg-muted/55 px-2 py-1 text-label font-medium text-muted-foreground"
                    >
                      {getPRInfo(pullRequests[0]).icon}
                      <span>#{pullRequests[0].externalId}</span>
                    </button>
                  </HoverCardTrigger>
                  <HoverCardContent
                    className="w-72 p-3"
                    side="bottom"
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {getPRInfo(pullRequests[0]).icon}
                        <span>{getPRInfo(pullRequests[0]).status}</span>
                        <span className="text-muted-foreground/50">•</span>
                        <span>#{pullRequests[0].externalId}</span>
                      </div>
                      <p className="text-sm font-medium leading-snug">
                        {pullRequests[0].title || t("tasks:pr.label")}
                      </p>
                    </div>
                  </HoverCardContent>
                </HoverCard>
              )}

              {pullRequests.length > 1 &&
                (() => {
                  const hasOpen = pullRequests.some(
                    (pr) => !pr.metadata?.merged && !pr.metadata?.draft,
                  );
                  const allMerged = pullRequests.every(
                    (pr) => pr.metadata?.merged,
                  );
                  const iconColor = allMerged
                    ? "text-info-foreground"
                    : hasOpen
                      ? "text-success-foreground"
                      : "text-muted-foreground";

                  return (
                    <HoverCard openDelay={200} closeDelay={100}>
                      <HoverCardTrigger asChild>
                        <button
                          type="button"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1.5 rounded border border-border/70 bg-muted/55 px-2 py-1 text-label font-medium text-muted-foreground"
                        >
                          <GitPullRequest className={`h-3 w-3 ${iconColor}`} />
                          <span>
                            {t("tasks:pr.count", {
                              count: pullRequests.length,
                            })}
                          </span>
                        </button>
                      </HoverCardTrigger>
                      <HoverCardContent
                        className="w-auto min-w-56 max-w-96 p-1"
                        side="bottom"
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        {pullRequests.map((pr, index) => {
                          const prInfo = getPRInfo(pr);
                          const repoMatch = pr.url.match(
                            /github\.com\/([^/]+\/[^/]+)\/pull/,
                          );
                          const repoName = repoMatch ? repoMatch[1] : null;
                          return (
                            <div key={pr.id}>
                              {index > 0 && (
                                <hr className="border-border my-1" />
                              )}
                              <button
                                type="button"
                                onClick={() => window.open(pr.url, "_blank")}
                                className="w-full px-2 py-1.5 text-left hover:bg-muted/50 rounded transition-colors"
                              >
                                <div className="flex items-center gap-1.5 text-label text-muted-foreground">
                                  {prInfo.icon}
                                  <span>
                                    {repoName}#{pr.externalId}
                                  </span>
                                </div>
                                <p className="text-xs leading-tight line-clamp-2 mt-0.5">
                                  {pr.title || t("tasks:pr.label")}
                                </p>
                                <span className="text-meta text-muted-foreground">
                                  {prInfo.status}
                                </span>
                              </button>
                            </div>
                          );
                        })}
                      </HoverCardContent>
                    </HoverCard>
                  );
                })()}
              <TaskTimerButton
                task={{
                  id: task.id,
                  number: task.number,
                  title: task.title,
                  projectId: task.projectId,
                  estimate: task.estimate ?? null,
                  isDone: taskIsCompleted,
                }}
                reveal="hover"
                className="ml-auto"
              />
            </div>
          </div>
        </ContextMenuTrigger>

        {project && workspace && (
          <TaskCardContextMenuContent
            task={task}
            taskCardContext={{
              projectId: project.id,
              worskpaceId: workspace.id,
            }}
            onDeleteClick={() => setIsDeleteTaskModalOpen(true)}
          />
        )}
      </ContextMenu>

      <AlertDialog
        open={isDeleteTaskModalOpen}
        onOpenChange={setIsDeleteTaskModalOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("tasks:delete.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("tasks:delete.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" size="sm" />}>
              {t("common:actions.cancel")}
            </AlertDialogClose>
            <AlertDialogClose
              render={
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDeleteTask}
                />
              }
            >
              {t("tasks:delete.action")}
            </AlertDialogClose>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default TaskCard;
