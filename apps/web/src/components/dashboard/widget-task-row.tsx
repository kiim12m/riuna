import { Calendar, CalendarClock, CalendarX, Layout } from "lucide-react";
import projectIcons from "@/constants/project-icons";
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
}: {
  task: WidgetTask;
  onOpen: () => void;
}) {
  const dueStatus = getDueDateStatus(task.dueDate, task.isDone);
  const DueIcon = DUE_DATE_ICON[dueStatus];
  const ProjectIcon =
    projectIcons[task.projectIcon as keyof typeof projectIcons] ?? Layout;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-left transition-colors duration-(--motion-fast) ease-out-quart hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="shrink-0">{getPriorityIcon(task.priority)}</span>

      <span
        className={cn(
          "min-w-0 flex-1 truncate text-body",
          task.isDone && "text-muted-foreground line-through",
        )}
      >
        {task.title}
      </span>

      <span className="hidden shrink-0 items-center gap-1 text-[10px] text-muted-foreground lg:flex">
        <ProjectIcon className="size-3" />
        <span className="max-w-24 truncate">{task.projectName}</span>
      </span>

      {task.dueDate && (
        <span
          className={cn(
            "flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px]",
            dueDateStatusColors[dueStatus],
          )}
        >
          <DueIcon className="size-3" />
          <span>{formatRelativeTime(task.dueDate)}</span>
        </span>
      )}
    </button>
  );
}
