import { Calendar, CalendarClock, CalendarX } from "lucide-react";
import { cn } from "@/lib/cn";
import { dueDateStatusColors, getDueDateStatus } from "@/lib/due-date-status";
import { formatDateShort } from "@/lib/format";

const icons = {
  overdue: CalendarX,
  "due-soon": CalendarClock,
  "far-future": Calendar,
  "no-due-date": Calendar,
} as const;

type DueDatePillProps = {
  dueDate: string;
  isCompleted: boolean;
  className?: string;
};

/**
 * El vencimiento de una tarea en una fila: color e icono segun lo cerca que
 * este, y la fecha en el idioma de la persona. Lo comparten la Lista, el
 * Backlog y la vista publica, que tenian el mismo bloque copiado y lo
 * formateaban con `date-fns` sin locale («Oct 30» en una interfaz en español).
 */
export default function DueDatePill({
  dueDate,
  isCompleted,
  className,
}: DueDatePillProps) {
  const status = getDueDateStatus(dueDate, isCompleted);
  const Icon = icons[status];

  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-1 rounded px-2 py-1 text-label tabular-nums",
        dueDateStatusColors[status],
        className,
      )}
    >
      <Icon className="h-3 w-3 shrink-0" />
      <span className="truncate">{formatDateShort(dueDate)}</span>
    </div>
  );
}
