import { useDroppable } from "@dnd-kit/core";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ProjectWithTasks } from "@/types/project";
import type Task from "@/types/task";
import TaskRow from "./task-row";

// El modo jerarquia no parte la lista en secciones: la columna deja de ser la
// division y el arbol pasa a serlo. Cada fila lleva su estado encima, como en
// la agrupacion por equipo, porque ya no hay cabecera que lo diga.

export const NEST_DROPPABLE_PREFIX = "nest:";

export type TreeRow = {
  task: Task;
  depth: number;
  hasChildren: boolean;
  isCollapsed: boolean;
};

/**
 * Zona de soltar para colgar una tarea de otra. Se dibuja encima de la fila y
 * solo mientras se arrastra: el resto del tiempo estorbaria al clic.
 */
function NestZone({ taskId, active }: { taskId: string; active: boolean }) {
  const { setNodeRef } = useDroppable({
    id: `${NEST_DROPPABLE_PREFIX}${taskId}`,
    data: { type: "nest", taskId },
    disabled: !active,
  });

  if (!active) return null;

  return (
    <div
      ref={setNodeRef}
      className="pointer-events-auto absolute inset-y-0 right-0 left-1/3 z-10"
      aria-hidden="true"
    />
  );
}

type TreeSectionProps = {
  rows: TreeRow[];
  project: ProjectWithTasks;
  columnsByStatus: Map<string, ProjectWithTasks["columns"][number]>;
  collapsedIds: ReadonlySet<string>;
  onToggle: (taskId: string) => void;
  draggingTaskId: string | null;
  nestTargetId: string | null;
};

export default function TreeSection({
  rows,
  project,
  columnsByStatus,
  onToggle,
  draggingTaskId,
  nestTargetId,
}: TreeSectionProps) {
  const { t } = useTranslation();

  // Arrastrar una tarea sobre su propia rama no puede colgarla de si misma; se
  // apagan esas zonas en vez de dejar que el servidor conteste un 400.
  const forbiddenTargets = useMemo(() => {
    if (!draggingTaskId) return new Set<string>();

    const dragged = rows.find((row) => row.task.id === draggingTaskId);
    const draggedPath = dragged?.task.path;
    if (!draggedPath) return new Set([draggingTaskId]);

    return new Set(
      rows
        .filter((row) => (row.task.path ?? "").startsWith(draggedPath))
        .map((row) => row.task.id),
    );
  }, [rows, draggingTaskId]);

  if (rows.length === 0) {
    return (
      <div className="py-6 px-4 text-center text-xs text-muted-foreground">
        {t("tasks:listView.noTasks")}
      </div>
    );
  }

  return (
    <div className="bg-card">
      {rows.map((row) => (
        <div key={row.task.id} className="relative">
          <NestZone
            taskId={row.task.id}
            active={
              draggingTaskId !== null && !forbiddenTargets.has(row.task.id)
            }
          />
          <TaskRow
            task={row.task}
            projectSlug={project.slug ?? ""}
            statusColumn={columnsByStatus.get(row.task.status)}
            tree={{
              depth: row.depth,
              hasChildren: row.hasChildren,
              isCollapsed: row.isCollapsed,
              onToggle: () => onToggle(row.task.id),
              isNestTarget: nestTargetId === row.task.id,
            }}
          />
        </div>
      ))}
    </div>
  );
}
