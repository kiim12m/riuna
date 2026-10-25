import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useNavigate } from "@tanstack/react-router";
import { useReducedMotion } from "framer-motion";
import { ChevronRight } from "lucide-react";
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
import { getColumnIcon } from "@/lib/column";
import { isTaskCompleted } from "@/lib/due-date-status";
import { getPriorityIcon } from "@/lib/priority";
import { toast } from "@/lib/toast";
import queryClient from "@/query-client";
import useBulkSelectionStore from "@/store/bulk-selection";
import useProjectStore from "@/store/project";
import useRealtimeHighlightStore from "@/store/realtime-highlight";
import { useUserPreferencesStore } from "@/store/user-preferences";
import type Task from "@/types/task";
import TaskCardContextMenuContent from "../kanban-board/task-card-context-menu/task-card-context-menu-content";
import { TaskLabels } from "../kanban-board/task-labels";
import SubtaskBadge from "../task/subtask-badge";
import { ContextMenu, ContextMenuTrigger } from "../ui/context-menu";

type TaskRowProps = {
  /** Sin arrastre: las tareas de un subproyecto en la lista del padre. */
  sortable?: boolean;
  task: Task;
  projectSlug: string;
  // Solo llega cuando la lista no esta agrupada por estado: entonces la
  // seccion ya no lo dice y la fila tiene que llevarlo.
  statusColumn?: {
    id: string;
    name: string;
    isFinal?: boolean | null;
    icon?: string | null;
  };
  // Solo llega en el modo jerarquia: la sangria, el desplegable y si la fila
  // es ahora mismo el destino de un arrastre.
  tree?: {
    depth: number;
    hasChildren: boolean;
    isCollapsed: boolean;
    onToggle: () => void;
    isNestTarget?: boolean;
  };
};

// Cada nivel sangra lo justo para que la relacion se lea sin comerse el ancho
// del titulo, que es lo que pasa cuando se sangra por tabulador entero.
const TREE_INDENT_PX = 18;

// La parte derecha va en ranuras de ancho fijo a partir de `sm`: midiendo
// cada pieza por su contenido, «Hecha» y «En revisión», «8 oct» y «30 oct» o
// uno y dos avatares descolocaban la fila siguiente. En movil no: tres
// ranuras fijas dejarian el titulo en nada.
const STATUS_SLOT = "sm:w-28";
const DUE_DATE_SLOT = "sm:w-[4.75rem]";
const ASSIGNEE_SLOT = "sm:w-16";

function TaskRow({
  task,
  projectSlug,
  statusColumn,
  tree,
  sortable = true,
}: TaskRowProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, disabled: !sortable });

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
        search: (previous: Record<string, unknown>) => ({
          ...previous,
          taskId: undefined,
        }),
      });
    } else {
      // Sin perder el resto de la busqueda (los subproyectos, ADR 089).
      navigate({
        to: ".",
        search: (previous: Record<string, unknown>) => ({
          ...previous,
          taskId: task.id,
        }),
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
        tree?.isNestTarget && "bg-primary/10 ring-2 ring-inset ring-primary/40",
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
            style={
              tree
                ? { paddingLeft: 16 + tree.depth * TREE_INDENT_PX }
                : undefined
            }
            {...attributes}
            {...listeners}
          >
            {tree &&
              (tree.hasChildren ? (
                <button
                  type="button"
                  aria-label={
                    tree.isCollapsed
                      ? t("tasks:tree.expand")
                      : t("tasks:tree.collapse")
                  }
                  aria-expanded={!tree.isCollapsed}
                  onClick={(event) => {
                    event.stopPropagation();
                    tree.onToggle();
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                  className="flex-shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <ChevronRight
                    className={cn(
                      "h-3 w-3 transition-transform",
                      !tree.isCollapsed && "rotate-90",
                    )}
                  />
                </button>
              ) : (
                // Hueco del mismo ancho que el desplegable: sin el, las hojas
                // y las ramas de un mismo nivel no quedarian alineadas.
                <span className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
              ))}

            {showPriority && (
              <div className="flex-shrink-0 first:[&_svg]:h-4 first:[&_svg]:w-4">
                {getPriorityIcon(task.priority ?? "")}
              </div>
            )}
            {/* En movil la clave le quitaba el sitio al titulo: se queda en el
             * detalle y en pantallas anchas. */}
            {showTaskNumbers && (
              <div
                className="hidden text-xs font-mono tabular-nums text-muted-foreground flex-shrink-0 sm:block"
                // Ancho de la clave hasta el numero 9999: «DEMO-1» y «DEMO-16»
                // ocupan lo mismo y los titulos de un nivel empiezan a la vez.
                style={{ minWidth: `${projectSlug.length + 5}ch` }}
              >
                {projectSlug}-{task.number}
              </div>
            )}

            <div className="flex-1 min-w-0 flex items-center gap-2">
              <span className="line-clamp-2 min-w-0 text-sm text-foreground sm:truncate">
                {task.isMilestone && (
                  <span aria-hidden="true" className="mr-1 text-brand-strong">
                    ◆
                  </span>
                )}
                {task.title}
              </span>
              <SubtaskBadge subtree={task.subtree} variant="inline" />
              {/* En movil, como la clave: las etiquetas no encogen y dejaban
               * el titulo en nada. */}
              <div className="ml-auto hidden items-center gap-1 sm:flex">
                {showLabels && <TaskLabels labels={task.labels ?? []} />}
              </div>
            </div>

            {statusColumn && (
              <div className={cn("flex-shrink-0", STATUS_SLOT)}>
                <div
                  className="flex items-center gap-1 text-label text-muted-foreground rounded border border-border/60 px-1.5 py-0.5 [&_svg]:h-3 [&_svg]:w-3 [&_svg]:shrink-0"
                  title={statusColumn.name}
                >
                  {getColumnIcon(
                    statusColumn.id,
                    statusColumn.isFinal ?? undefined,
                    statusColumn.icon,
                  )}
                  <span className="truncate">{statusColumn.name}</span>
                </div>
              </div>
            )}

            {/* Sin fecha la ranura se queda vacia, para no correr a las demas. */}
            {showDueDates && (
              <div
                className={cn(
                  "flex-shrink-0",
                  DUE_DATE_SLOT,
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
              <div
                className={cn("flex flex-shrink-0 justify-end", ASSIGNEE_SLOT)}
              >
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

export default TaskRow;
