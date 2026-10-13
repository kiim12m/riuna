import {
  closestCorners,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  type UniqueIdentifier,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { snapCenterToCursor } from "@dnd-kit/modifiers";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { produce } from "immer";
import { Archive, ChevronRight, Flag, Plus, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { priorityColorsTaskCard } from "@/constants/priority-colors";
import { useUpdateTask } from "@/hooks/mutations/task/use-update-task";
import { useUpdateTaskParent } from "@/hooks/mutations/task/use-update-task-parent";
import { useRegisterShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { cn } from "@/lib/cn";
import { getColumnIcon } from "@/lib/column";
import { type GroupByField, groupTasksByTeam } from "@/lib/group-tasks";
import {
  buildTaskTree,
  flattenVisibleRows,
  indentTarget,
  outdentTarget,
  wouldCreateCycle,
} from "@/lib/task-tree";
import { toast } from "@/lib/toast";
import useBulkSelectionStore from "@/store/bulk-selection";
import useProjectStore from "@/store/project";
import type { ProjectWithTasks } from "@/types/project";
import BulkToolbar from "../bulk-selection/bulk-toolbar";
import { ArchiveTasksModal } from "../shared/modals/archive-tasks-modal";
import CreateTaskModal from "../shared/modals/create-task-modal";
import TaskRow from "./task-row";
import TreeSection, { NEST_DROPPABLE_PREFIX } from "./tree-section";

type Subproject = {
  id: string;
  name: string;
  slug: string;
  icon?: string | null;
  columns: Array<{
    slug: string;
    name: string;
    icon?: string | null;
    isFinal?: boolean;
  }>;
  tasks: Task[];
};

type ListViewProps = {
  project: ProjectWithTasks;
  disableDragDrop?: boolean;
  groupBy?: GroupByField;
  /** Las tareas de los subproyectos (ADR 089), una seccion por cada uno. */
  subprojects?: Subproject[];
};

function ListView({
  project,
  disableDragDrop = false,
  groupBy = "status",
  subprojects,
}: ListViewProps) {
  const { t } = useTranslation();
  const isGroupedByTeam = groupBy === "team";
  const isTreeMode = groupBy === "tree";
  const { setProject } = useProjectStore();
  const {
    setAvailableTasks,
    focusNext,
    focusPrevious,
    focusedTaskId,
    clearFocus,
  } = useBulkSelectionStore();
  const { mutate: updateTask } = useUpdateTask();
  const { mutateAsync: reparentTask } = useUpdateTaskParent();
  const navigate = useNavigate();
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  const [overColumnId, setOverColumnId] = useState<string | null>(null);
  // Solo guarda las secciones que alguien ha plegado a mano. Lo que no esta
  // aqui esta abierto, que es lo que hace falta para que una seccion nueva
  // —otra columna, otro equipo— no aparezca cerrada.
  const [expandedSections, setExpandedSections] = useState<
    Record<string, boolean>
  >({});
  // Al reves que las secciones: aqui se guarda lo plegado, porque una rama
  // nueva tiene que nacer abierta igual que una seccion nueva.
  const [collapsedTaskIds, setCollapsedTaskIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [nestTargetId, setNestTargetId] = useState<string | null>(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [activeColumn, setActiveColumn] = useState<string | null>(null);
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);
  const [columnToArchive, setColumnToArchive] = useState<
    ProjectWithTasks["columns"][number] | null
  >(null);

  const isSectionExpanded = useCallback(
    (sectionId: string) => expandedSections[sectionId] ?? true,
    [expandedSections],
  );

  const allTasks = useMemo(
    () => (project?.columns ?? []).flatMap((column) => column.tasks),
    [project],
  );

  const tasksById = useMemo(() => {
    const map = new Map<string, (typeof allTasks)[number]>();
    for (const task of allTasks) map.set(task.id, task);
    return map;
  }, [allTasks]);

  const treeRows = useMemo(() => {
    if (!isTreeMode) return [];
    return flattenVisibleRows(buildTaskTree(allTasks), collapsedTaskIds);
  }, [isTreeMode, allTasks, collapsedTaskIds]);

  const toggleBranch = useCallback((taskId: string) => {
    setCollapsedTaskIds((previous) => {
      const next = new Set(previous);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  }, []);

  const teamGroups = useMemo(() => {
    if (!isGroupedByTeam) return [];

    const tasks = (project?.columns ?? []).flatMap((column) => column.tasks);
    return groupTasksByTeam(tasks, t("tasks:group.noTeam"));
  }, [isGroupedByTeam, project, t]);

  // Agrupando por equipo la seccion deja de decir el estado, asi que cada fila
  // lo lleva encima. El endpoint de tareas devuelve la columna con `id` igual
  // al slug, pero se indexan los dos por si eso deja de ser cierto.
  const columnsByStatus = useMemo(() => {
    const byStatus = new Map<string, ProjectWithTasks["columns"][number]>();

    for (const column of project?.columns ?? []) {
      byStatus.set(column.slug, column);
      byStatus.set(column.id, column);
    }

    return byStatus;
  }, [project]);

  useEffect(() => {
    if (isTreeMode) {
      setAvailableTasks(treeRows.map((row) => row.task.id));
      return;
    }

    if (isGroupedByTeam) {
      setAvailableTasks(
        teamGroups
          .filter((group) => isSectionExpanded(group.id))
          .flatMap((group) => group.tasks.map((task) => task.id)),
      );
      return;
    }

    if (project?.columns) {
      const visibleTaskIds = project.columns
        .filter((column) => isSectionExpanded(column.id))
        .flatMap((column) => column.tasks.map((task) => task.id));
      setAvailableTasks(visibleTaskIds);
    }
  }, [
    project,
    setAvailableTasks,
    isGroupedByTeam,
    isTreeMode,
    treeRows,
    teamGroups,
    isSectionExpanded,
  ]);

  useEffect(() => {
    clearFocus();
  }, [clearFocus]);

  const reparent = useCallback(
    async (taskId: string, parentId: string | null) => {
      const task = tasksById.get(taskId);
      if (!task || !project) return;
      if ((task.parentId ?? null) === parentId) return;

      try {
        await reparentTask({
          taskId,
          parentId,
          projectId: project.id,
          previousParentId: task.parentId ?? null,
        });
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : t("tasks:tree.reparentError"),
        );
      }
    },
    [project, reparentTask, t, tasksById],
  );

  // `Tab` cuelga la tarea del hermano de encima y `Shift+Tab` la sube al nivel
  // del padre, que es como se reordena una lista anidada en cualquier editor.
  // Solo actuan sobre la fila enfocada, y solo en el modo jerarquia.
  const indentFocused = useCallback(() => {
    const focused = useBulkSelectionStore.getState().focusedTaskId;
    if (!isTreeMode || !focused) return;

    const target = indentTarget(treeRows, focused);
    if (!target) return;

    void reparent(focused, target);
  }, [isTreeMode, reparent, treeRows]);

  const outdentFocused = useCallback(() => {
    const focused = useBulkSelectionStore.getState().focusedTaskId;
    if (!isTreeMode || !focused) return;

    const target = outdentTarget(tasksById, focused);
    if (target === undefined) return;

    void reparent(focused, target);
  }, [isTreeMode, reparent, tasksById]);

  // El tabulador solo se secuestra mientras hay una fila enfocada en el modo
  // jerarquia. Fuera de ahi tiene que seguir siendo el tabulador de siempre:
  // registrarlo a todas horas dejaria la vista sin navegacion por teclado.
  const treeKeyboardActive = isTreeMode && Boolean(focusedTaskId);

  useRegisterShortcuts({
    shortcuts: {
      ...(treeKeyboardActive ? { tab: indentFocused } : {}),
      j: () => {
        focusNext();
        const state = useBulkSelectionStore.getState();
        if (state.focusedTaskId) {
          navigate({ to: ".", search: { taskId: state.focusedTaskId } });
        }
      },
      k: () => {
        focusPrevious();
        const state = useBulkSelectionStore.getState();
        if (state.focusedTaskId) {
          navigate({ to: ".", search: { taskId: state.focusedTaskId } });
        }
      },
      Enter: () => {
        if (focusedTaskId && project) {
          navigate({
            to: "/dashboard/workspace/$workspaceId/project/$projectId/task/$taskId",
            params: {
              workspaceId: project.workspaceId,
              projectId: project.id,
              taskId: focusedTaskId,
            },
          });
        }
      },
    },
    modifierShortcuts: treeKeyboardActive
      ? { Shift: { Tab: outdentFocused } }
      : undefined,
  });

  // Arrastrar en esta vista mueve la tarea de estado, y agrupando por equipo
  // las secciones ya no son estados: no habria a donde soltarla. En el modo
  // jerarquia si se arrastra, pero para colgar una tarea de otra, no para
  // cambiarle el estado.
  const dragDropDisabled = disableDragDrop || isGroupedByTeam;

  const dragDisabled = dragDropDisabled && !isTreeMode;

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: dragDisabled ? 999999 : 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: dragDisabled ? 999999 : 200,
        tolerance: 8,
      },
    }),
    useSensor(KeyboardSensor),
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id);
    setNestTargetId(null);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;

    if (isTreeMode) {
      const overId = over?.id.toString() ?? "";
      setNestTargetId(
        overId.startsWith(NEST_DROPPABLE_PREFIX)
          ? overId.slice(NEST_DROPPABLE_PREFIX.length)
          : null,
      );
      return;
    }

    if (!over || !activeId) {
      setOverColumnId(null);
      return;
    }

    if (project?.columns?.some((col) => col.id === over.id)) {
      setOverColumnId(over.id.toString());
      return;
    }

    const taskId = over.id.toString();
    const columnWithTask = project?.columns?.find((col) =>
      col.tasks.some((task) => task.id === taskId),
    );

    if (columnWithTask) {
      setOverColumnId(columnWithTask.id);
    } else {
      setOverColumnId(null);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setOverColumnId(null);

    if (isTreeMode) {
      const target = nestTargetId;
      setNestTargetId(null);

      const draggedId = active.id.toString();
      if (!target || target === draggedId) return;
      // El servidor rechaza el ciclo igualmente; comprobarlo aqui evita el
      // viaje de ida y vuelta y el mensaje de error por algo que ya se sabe.
      if (wouldCreateCycle(tasksById, draggedId, target)) {
        toast.error(t("tasks:tree.cycleError"));
        return;
      }

      void reparent(draggedId, target);
      return;
    }

    if (!over || !project?.columns) return;

    const activeTaskId = active.id.toString();
    const overId = over.id.toString();

    const updatedProject = produce(project, (draft) => {
      const sourceColumn = draft?.columns?.find((col) =>
        col.tasks.some((task) => task.id === activeTaskId),
      );
      const destinationColumn = draft?.columns?.find(
        (col) =>
          col.id === overId || col.tasks.some((task) => task.id === overId),
      );

      if (!sourceColumn || !destinationColumn) return;

      const sourceTaskIndex = sourceColumn.tasks.findIndex(
        (task) => task.id === activeTaskId,
      );
      const task = sourceColumn.tasks[sourceTaskIndex];

      sourceColumn.tasks = sourceColumn.tasks.filter(
        (t) => t.id !== activeTaskId,
      );

      if (sourceColumn.id === destinationColumn.id) {
        let destinationIndex = destinationColumn.tasks.findIndex(
          (t) => t.id === overId,
        );
        if (sourceTaskIndex <= destinationIndex) {
          destinationIndex += 1;
        }
        destinationColumn.tasks.splice(destinationIndex, 0, task);

        destinationColumn.tasks.forEach((t, index) => {
          updateTask({
            ...t,
            status: destinationColumn.slug,
            position: index,
          });
        });
      } else {
        // A task's status is a column slug. The column id is only the
        // droppable identity here, and the two are interchangeable only
        // because the tasks endpoint happens to return `id: column.slug`.
        task.status = destinationColumn.slug;
        const destinationIndex =
          overId === destinationColumn.id
            ? destinationColumn.tasks.length
            : destinationColumn.tasks.findIndex((t) => t.id === overId) + 1;

        destinationColumn.tasks.splice(destinationIndex, 0, task);

        destinationColumn.tasks.forEach((t, index) => {
          updateTask({
            ...t,
            status: destinationColumn.slug,
            position: index,
          });
        });

        sourceColumn.tasks.forEach((t, index) => {
          updateTask({
            ...t,
            position: index,
          });
        });
      }
    });

    setProject(updatedProject);
  };

  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  };

  const handleArchiveClick = (column: ProjectWithTasks["columns"][number]) => {
    if (!column.isFinal || column.tasks.length === 0) return;
    setColumnToArchive(column);
    setIsArchiveModalOpen(true);
  };

  const handleConfirmArchive = () => {
    if (!columnToArchive) return;

    const updatedProject = produce(project, (draft) => {
      const archivedColumn = draft?.columns?.find(
        (col) => col.id === columnToArchive.id,
      );
      if (!archivedColumn) return;

      for (const task of archivedColumn.tasks) {
        updateTask({
          ...task,
          status: "archived",
        });
      }

      archivedColumn.tasks = [];
    });

    setProject(updatedProject);
    toast.success(
      t("tasks:archive.success", { count: columnToArchive.tasks.length }),
    );

    setIsArchiveModalOpen(false);
    setColumnToArchive(null);
  };

  function ColumnSection({
    column,
  }: {
    column: ProjectWithTasks["columns"][number];
  }) {
    const { setNodeRef } = useDroppable({
      id: column.id,
      data: {
        type: "column",
        column,
      },
    });

    const showDropIndicator = activeId && overColumnId === column.id;

    return (
      <div
        className={cn(
          "border-b border-border/50 transition-colors duration-150 overflow-auto",
          showDropIndicator && "border-l-4 border-l-ring bg-accent/35",
        )}
      >
        <div className="flex items-center justify-between py-2 px-4 bg-muted/60 border-b border-border/50">
          <button
            type="button"
            onClick={() => toggleSection(column.id)}
            className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-foreground transition-colors"
          >
            <ChevronRight
              className={cn(
                "w-3 h-3 transition-transform",
                isSectionExpanded(column.id) && "rotate-90",
              )}
            />
            <div className="flex items-center gap-2 h-4">
              {getColumnIcon(column.id, column.isFinal, column.icon)}
              <div className="flex items-center gap-1">
                <span className="mt-1 mr-1">{column.name}</span>
                <span className="text-xs text-muted-foreground mt-0.5">
                  {column.tasks.length}
                </span>
              </div>
            </div>
          </button>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                setIsTaskModalOpen(true);
                setActiveColumn(column.id);
              }}
              className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
              title={t("tasks:listView.addTask")}
            >
              <Plus className="w-3 h-3" />
            </button>

            {column.isFinal && column.tasks.length > 0 && (
              <button
                type="button"
                onClick={() => handleArchiveClick(column)}
                className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
                title={t("tasks:listView.archiveAllTooltip")}
              >
                <Archive className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {isSectionExpanded(column.id) && (
          <div
            ref={setNodeRef}
            className="bg-card transition-[translate,opacity] duration-150 ease-out starting:-translate-y-1 starting:opacity-0 motion-reduce:starting:translate-y-0"
          >
            <SortableContext
              items={column.tasks}
              strategy={verticalListSortingStrategy}
            >
              <AnimatePresence initial={false} mode="popLayout">
                {column.tasks.map((task) => (
                  <motion.div
                    key={task.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
                  >
                    <TaskRow task={task} projectSlug={project?.slug ?? ""} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </SortableContext>

            {column.tasks.length === 0 && (
              <div className="py-6 px-4 text-center text-xs text-muted-foreground">
                {t("tasks:listView.noTasks")}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Sin zona de soltar ni archivado: una seccion de equipo no es un estado, y
  // «archivar todo lo de este equipo» no significa nada.
  function TeamSection({ group }: { group: (typeof teamGroups)[number] }) {
    return (
      <div className="border-b border-border/50 overflow-auto">
        <div className="flex items-center justify-between py-2 px-4 bg-muted/60 border-b border-border/50">
          <button
            type="button"
            onClick={() => toggleSection(group.id)}
            className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-foreground transition-colors"
          >
            <ChevronRight
              className={cn(
                "w-3 h-3 transition-transform",
                isSectionExpanded(group.id) && "rotate-90",
              )}
            />
            <div className="flex items-center gap-2 h-4">
              <Users className="w-4 h-4 text-muted-foreground" />
              <div className="flex items-center gap-1">
                <span className="mt-1 mr-1">{group.name}</span>
                <span className="text-xs text-muted-foreground mt-0.5">
                  {group.tasks.length}
                </span>
              </div>
            </div>
          </button>
        </div>

        {isSectionExpanded(group.id) && (
          <div className="bg-card transition-[translate,opacity] duration-150 ease-out starting:-translate-y-1 starting:opacity-0 motion-reduce:starting:translate-y-0">
            <SortableContext
              items={group.tasks}
              strategy={verticalListSortingStrategy}
            >
              <AnimatePresence initial={false} mode="popLayout">
                {group.tasks.map((task) => (
                  <motion.div
                    key={task.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
                  >
                    <TaskRow
                      task={task}
                      projectSlug={project?.slug ?? ""}
                      statusColumn={columnsByStatus.get(task.status)}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </SortableContext>
          </div>
        )}
      </div>
    );
  }

  // Una seccion por subproyecto, al final: sus estados son sus columnas, asi
  // que no caben en las del padre, y sus filas no se arrastran entre ellas.
  function SubprojectSection({ subproject }: { subproject: Subproject }) {
    const sectionId = `subproject:${subproject.id}`;
    const columnOf = new Map(
      subproject.columns.map((column) => [
        column.slug,
        { id: column.slug, ...column },
      ]),
    );
    return (
      <div
        className="border-b border-border/50 overflow-auto"
        data-testid="list-subproject"
      >
        <div className="flex items-center justify-between py-2 px-4 bg-muted/60 border-b border-border/50">
          <button
            type="button"
            onClick={() => toggleSection(sectionId)}
            className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-foreground transition-colors"
          >
            <ChevronRight
              className={cn(
                "w-3 h-3 transition-transform",
                isSectionExpanded(sectionId) && "rotate-90",
              )}
            />
            <span className="rounded bg-muted px-1 font-mono text-label text-muted-foreground">
              {subproject.slug}
            </span>
            <span className="mt-0.5">{subproject.name}</span>
            <span className="text-xs text-muted-foreground mt-0.5">
              {subproject.tasks.length}
            </span>
          </button>
        </div>
        {isSectionExpanded(sectionId) && (
          <div className="bg-card">
            <SortableContext
              items={subproject.tasks}
              strategy={verticalListSortingStrategy}
            >
              {subproject.tasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={{
                    ...task,
                    projectSlug: subproject.slug,
                    projectName: subproject.name,
                  }}
                  projectSlug={subproject.slug}
                  statusColumn={columnOf.get(task.status)}
                  sortable={false}
                />
              ))}
            </SortableContext>
            {subproject.tasks.length === 0 && (
              <div className="py-6 px-4 text-center text-xs text-muted-foreground">
                {t("tasks:listView.noTasks")}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  if (!project?.columns) {
    return null;
  }

  const activeTask = activeId
    ? project.columns
        ?.flatMap((col) => col.tasks)
        .find((task) => task.id === activeId)
    : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      modifiers={[snapCenterToCursor]}
    >
      <div className="w-full h-full overflow-auto bg-muted/20">
        <div className="divide-y divide-border/50">
          {isTreeMode && (
            <SortableContext
              items={treeRows.map((row) => row.task.id)}
              strategy={verticalListSortingStrategy}
            >
              <TreeSection
                rows={treeRows}
                project={project}
                columnsByStatus={columnsByStatus}
                collapsedIds={collapsedTaskIds}
                onToggle={toggleBranch}
                draggingTaskId={activeId ? activeId.toString() : null}
                nestTargetId={nestTargetId}
              />
            </SortableContext>
          )}
          {!isTreeMode &&
            (isGroupedByTeam
              ? teamGroups.map((group) => (
                  <TeamSection key={group.id} group={group} />
                ))
              : project.columns.map((column) => (
                  <ColumnSection key={column.id} column={column} />
                )))}
          {isGroupedByTeam && teamGroups.length === 0 && (
            <div className="py-6 px-4 text-center text-xs text-muted-foreground">
              {t("tasks:listView.noTasks")}
            </div>
          )}
          {subprojects?.map((subproject) => (
            <SubprojectSection key={subproject.id} subproject={subproject} />
          ))}
        </div>
      </div>

      <DragOverlay>
        {activeTask && (
          <div className="bg-card border border-border rounded-lg shadow-lg p-2 max-w-[200px] cursor-grabbing">
            <div className="flex items-center gap-2">
              <div className="flex-shrink-0">
                <Flag
                  className={cn(
                    "w-3 h-3",
                    priorityColorsTaskCard[
                      activeTask.priority as keyof typeof priorityColorsTaskCard
                    ],
                  )}
                />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-label font-mono text-muted-foreground">
                    {project?.slug}-{activeTask.number}
                  </span>
                  <span className="text-xs text-foreground truncate">
                    {activeTask.title}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </DragOverlay>

      <CreateTaskModal
        open={isTaskModalOpen}
        projectId={project.id}
        onClose={() => setIsTaskModalOpen(false)}
        status={activeColumn ?? "done"}
      />
      <ArchiveTasksModal
        open={isArchiveModalOpen}
        onClose={() => {
          setIsArchiveModalOpen(false);
          setColumnToArchive(null);
        }}
        onConfirm={handleConfirmArchive}
        taskCount={columnToArchive?.tasks.length ?? 0}
      />

      <BulkToolbar />
    </DndContext>
  );
}

export default ListView;
