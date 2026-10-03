import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ReactNode } from "react";
import {
  rowPlanOf,
  TaskRowActions,
} from "@/components/task-actions/task-row-actions";
import { InlineEstimate } from "@/components/timer/inline-estimate";
import type { PlanEntry, PlanTask } from "@/fetchers/planner";
import { cn } from "@/lib/cn";
import { PlannerRow } from "./planner-row";

type PlannerTaskCardProps = {
  task: PlanTask | PlanEntry;
  onOpen: () => void;
  /** Ausente en tarjetas de solo lectura (la de arrastre, "Vence este dia"). */
  onEstimateChange?: (seconds: number | null) => void;
  /** Igual: la tarjeta que se arrastra no lleva casilla. */
  onToggleDone?: (done: boolean) => void;
};

/**
 * La tarjeta del Planificador: `PlannerRow` -mas compacta que la de un
 * tablero de proyecto, sin menu contextual ni seleccion multiple, que no
 * existen aqui- arrastrable con `dnd-kit` en vez de la tarjeta de
 * `kanban-board`, que lee `useProjectStore()` -un solo proyecto- por dentro
 * (ADR 040). El arrastre vive en el `div` que envuelve a `PlannerRow`, no en
 * la propia fila: es el mismo `ref`/`style`/`listeners` de siempre, solo que
 * ahora separados del marcado que comparte con "Con hora" y "Vence este dia".
 */
export function PlannerTaskCard({
  task,
  onOpen,
  onEstimateChange,
  onToggleDone,
}: PlannerTaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const loggedSeconds = "loggedSeconds" in task ? (task.loggedSeconds ?? 0) : 0;

  const isEntry = "plannedDate" in task;

  const row = (menu?: ReactNode) => (
    <PlannerRow
      title={task.title}
      priority={task.priority}
      isDone={task.isDone}
      projectName={task.projectName}
      projectIcon={task.projectIcon}
      onOpen={onOpen}
      timerTask={task}
      onToggleDone={onToggleDone}
      keyRank={isEntry ? task.keyRank : null}
      menu={menu}
      className={cn(
        "cursor-grab active:cursor-grabbing",
        isDragging && "border-ring/40 bg-card shadow-lg hover:border-ring/40",
      )}
      trailing={
        onEstimateChange && (
          <InlineEstimate
            estimate={task.estimate}
            loggedSeconds={loggedSeconds}
            onSave={onEstimateChange}
          />
        )
      }
    />
  );

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {/* La tarjeta que se arrastra (sin casilla) no lleva menu. */}
      {onToggleDone ? (
        <TaskRowActions
          task={{
            id: task.id,
            number: task.number,
            title: task.title,
            projectId: task.projectId,
            estimate: task.estimate,
            isDone: task.isDone,
          }}
          plan={isEntry ? rowPlanOf(task) : null}
        >
          {row}
        </TaskRowActions>
      ) : (
        row()
      )}
    </div>
  );
}
