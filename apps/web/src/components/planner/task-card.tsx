import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Layout } from "lucide-react";
import { InlineEstimate } from "@/components/timer/inline-estimate";
import projectIcons from "@/constants/project-icons";
import type { PlanEntry, PlanTask } from "@/fetchers/planner";
import { cn } from "@/lib/cn";
import { getPriorityIcon } from "@/lib/priority";

type PlannerTaskCardProps = {
  task: PlanTask | PlanEntry;
  onOpen: () => void;
  /** Ausente en tarjetas de solo lectura (la de arrastre, "Vence este dia"). */
  onEstimateChange?: (seconds: number | null) => void;
};

/**
 * La tarjeta del Planificador: mas compacta que la de un tablero de proyecto
 * -no lleva menu contextual ni seleccion multiple, que no existen aqui- y
 * arrastrable con `dnd-kit` en vez de la tarjeta de `kanban-board`, que lee
 * `useProjectStore()` -un solo proyecto- por dentro (ADR 040).
 */
export function PlannerTaskCard({
  task,
  onOpen,
  onEstimateChange,
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

  const ProjectIcon =
    projectIcons[task.projectIcon as keyof typeof projectIcons] ?? Layout;
  const loggedSeconds = "loggedSeconds" in task ? (task.loggedSeconds ?? 0) : 0;

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {/** biome-ignore lint/a11y/useSemanticElements: sostiene contenido de bloque y dnd-kit ya le da semantica de arrastre */}
      <div
        role="button"
        tabIndex={0}
        aria-label={task.title}
        onClick={onOpen}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpen();
          }
        }}
        className={cn(
          "cursor-grab space-y-1 rounded-md border bg-background p-1.5 text-left outline-none transition-[border-color,box-shadow] duration-150 ease-out active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-ring",
          isDragging
            ? "border-ring/40 bg-card shadow-lg"
            : "border-border/70 hover:border-brand/45 hover:shadow-xs",
        )}
      >
        <div className="flex items-center gap-1.5">
          <span className="shrink-0">{getPriorityIcon(task.priority)}</span>
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-body",
              task.isDone && "text-muted-foreground line-through",
            )}
          >
            {task.title}
          </span>
        </div>
        <div className="flex items-center gap-1 text-meta text-muted-foreground">
          <ProjectIcon className="size-3 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{task.projectName}</span>
          {onEstimateChange && (
            <InlineEstimate
              estimate={task.estimate}
              loggedSeconds={loggedSeconds}
              onSave={onEstimateChange}
            />
          )}
        </div>
      </div>
    </div>
  );
}
