import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useNavigate } from "@tanstack/react-router";
import { useReducedMotion } from "framer-motion";
import { type CSSProperties, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AssigneeStack } from "@/components/task/assignee-stack";
import DueDatePill from "@/components/task/due-date-pill";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useDeleteTask } from "@/hooks/mutations/task/use-delete-task";
import useActiveWorkspace from "@/hooks/queries/workspace/use-active-workspace";
import { cn } from "@/lib/cn";
import { isTaskCompleted } from "@/lib/due-date-status";
import { getPriorityIcon } from "@/lib/priority";
import { toast } from "@/lib/toast";
import queryClient from "@/query-client";
import useBacklogBulkSelectionStore from "@/store/backlog-bulk-selection";
import useProjectStore from "@/store/project";
import useRealtimeHighlightStore from "@/store/realtime-highlight";
import { useUserPreferencesStore } from "@/store/user-preferences";
import type Task from "@/types/task";
import TaskCardContextMenuContent from "../kanban-board/task-card-context-menu/task-card-context-menu-content";
import { TaskLabels } from "../kanban-board/task-labels";
import SubtaskBadge from "../task/subtask-badge";
import { ContextMenu, ContextMenuTrigger } from "../ui/context-menu";

type BacklogTaskRowProps = {
  task: Task;
};

export default function BacklogTaskRow({ task }: BacklogTaskRowProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const { project } = useProjectStore();
  const taskIsCompleted = isTaskCompleted(task.status, project?.columns);
  const { data: workspace } = useActiveWorkspace();
  const {
    showAssignees,
    showPriority,
    showDueDates,
    showLabels,
    showTaskNumbers,
  } = useUserPreferencesStore();
  const [isDeleteTaskModalOpen, setIsDeleteTaskModalOpen] = useState(false);
  const { mutateAsync: deleteTask } = useDeleteTask();
  const { toggleSelection, isSelected, isFocused } =
    useBacklogBulkSelectionStore();
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

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition || "transform 200ms cubic-bezier(0.23, 1, 0.32, 1)",
    touchAction: isDragging ? "none" : "auto",
  };

  const handleClick = (e: React.MouseEvent) => {
    if (!project || !task) return;
    if (e.defaultPrevented) return;

    if (e.metaKey || e.ctrlKey) {
      e.preventDefault();
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
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleClick(e as unknown as React.MouseEvent);
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
      className={cn(
        "border-b border-border/50 transition-colors duration-150",
        isDragging && "opacity-50",
        isTaskSelected &&
          "bg-accent/60 shadow-sm ring-1 ring-inset ring-ring/30",
        isTaskFocused && "ring-2 ring-inset ring-ring/50",
        flashClass,
      )}
    >
      <ContextMenu>
        <ContextMenuTrigger asChild>
          {/* biome-ignore lint/a11y/noStaticElementInteractions: false positive for onClick and onKeyDown */}
          <div
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            className={cn(
              "group relative flex items-center gap-3 px-4 py-1.5 transition-colors cursor-pointer",
              isTaskSelected ? "bg-accent/45" : "hover:bg-accent/60",
            )}
            {...attributes}
            {...listeners}
          >
            {showPriority && (
              <div className="flex-shrink-0 first:[&_svg]:h-4 first:[&_svg]:w-4">
                {getPriorityIcon(task.priority ?? "")}
              </div>
            )}
            {showTaskNumbers && (
              <div
                className="text-xs font-mono tabular-nums text-muted-foreground flex-shrink-0"
                // Las mismas ranuras que la fila de la Lista (`list-view/task-row`).
                style={{ minWidth: `${(project?.slug ?? "").length + 5}ch` }}
              >
                {project?.slug}-{task.number}
              </div>
            )}

            <div className="flex-1 min-w-0 flex items-center gap-2">
              <span className="min-w-0 text-sm text-foreground truncate">
                {task.title}
              </span>
              <SubtaskBadge subtree={task.subtree} variant="inline" />
              {showLabels && (
                <div className="ml-auto hidden items-center gap-1 sm:flex">
                  <TaskLabels labels={task.labels ?? []} />
                </div>
              )}
            </div>

            {showDueDates && (
              <div
                className={cn(
                  "flex-shrink-0 sm:w-[4.75rem]",
                  !task.dueDate && "hidden sm:block",
                )}
              >
                {task.dueDate && (
                  <DueDatePill
                    dueDate={task.dueDate}
                    isCompleted={taskIsCompleted}
                    className="w-full"
                  />
                )}
              </div>
            )}

            {showAssignees && (
              <div className="flex flex-shrink-0 justify-end sm:w-16">
                <AssigneeStack
                  assignees={task.assignees ?? []}
                  size="md"
                  max={2}
                />
              </div>
            )}
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
