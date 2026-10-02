import { Calendar, CalendarClock, CalendarX } from "lucide-react";
import type { ReactNode } from "react";
import { ProjectPill } from "@/components/task/project-pill";
import { cn } from "@/lib/cn";
import {
  type DueDateStatus,
  dueDateStatusColors,
  getDueDateStatus,
} from "@/lib/due-date-status";
import { formatRelativeTime } from "@/lib/format";
import { getPriorityIcon } from "@/lib/priority";

const DUE_DATE_ICON: Record<DueDateStatus, typeof Calendar> = {
  overdue: CalendarX,
  "due-soon": CalendarClock,
  "far-future": Calendar,
  "no-due-date": Calendar,
};

export type WidgetTask = {
  id: string;
  title: string;
  priority: string;
  dueDate: string | null;
  isDone: boolean;
  projectId: string;
  projectName: string;
  projectIcon?: string | null;
};

/**
 * La fila de tarea dentro de un widget.
 *
 * Es la version corta de la que tenia "Mi trabajo", con las lecciones de aquel
 * repaso ya dentro: el chip de vencimiento lleva **icono ademas de color**
 * —`marca.md` §06 principio 2— y no se esconde en pantallas estrechas, que era
 * lo primero que se caia y lo unico que hace accionable una lista. Lo que si se
 * cae aqui son las etiquetas, los asignados y la columna: una tarjeta de un
 * tercio de ancho no es una pagina, y meterlos seria pedirle al ojo que lea
 * ocho cosas en cien pixeles.
 */
export function WidgetTaskRow({
  task,
  onOpen,
  variant = "widget",
  shaded = false,
  trailing,
}: {
  task: WidgetTask;
  onOpen: () => void;
  /** `list`: la lista a pagina completa de "Mis tareas", con el aire de las
   * filas de Hoy. `widget`: la fila compacta de un widget de Mi panel. */
  variant?: "widget" | "list";
  /** Fila par de la lista: la cebra de `barra-lateral.html`. */
  shaded?: boolean;
  /**
   * Un control propio al final -el cronometro en "Mis tareas"-. Va **fuera**
   * del boton de la fila, como hermano: un boton dentro de otro no es HTML
   * valido. Sin el, la fila es exactamente la de siempre.
   */
  trailing?: ReactNode;
}) {
  const dueStatus = getDueDateStatus(task.dueDate, task.isDone);
  const DueIcon = DUE_DATE_ICON[dueStatus];

  const row = (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-left transition-colors duration-(--motion-fast) ease-out-quart focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        variant === "list" && "gap-2.5 px-2.5 py-2",
        trailing
          ? "min-w-0 flex-1"
          : cn("hover:bg-accent", shaded && "bg-muted"),
      )}
    >
      <span className="shrink-0">{getPriorityIcon(task.priority)}</span>

      <span
        className={cn(
          "min-w-0 truncate text-body",
          task.isDone && "text-muted-foreground line-through",
        )}
      >
        {task.title}
      </span>

      <ProjectPill
        name={task.projectName}
        icon={task.projectIcon}
        className="ml-1 hidden lg:inline-flex"
      />

      {task.dueDate && (
        <span
          className={cn(
            "ml-auto flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-label",
            dueDateStatusColors[dueStatus],
          )}
        >
          <DueIcon className="size-3" />
          <span>{formatRelativeTime(task.dueDate)}</span>
        </span>
      )}
    </button>
  );

  if (!trailing) return row;

  return (
    <div
      className={cn(
        "group flex items-center rounded-md pr-2 transition-colors duration-(--motion-fast) ease-out-quart hover:bg-accent",
        shaded && "bg-muted",
      )}
    >
      {row}
      {trailing}
    </div>
  );
}
