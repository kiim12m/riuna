import { Layout } from "lucide-react";
import { useTranslation } from "react-i18next";
import { InlineEstimate } from "@/components/timer/inline-estimate";
import { TimerButton } from "@/components/timer/timer-button";
import { Checkbox } from "@/components/ui/checkbox";
import projectIcons from "@/constants/project-icons";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/duration";
import { fromMinutes } from "@/lib/minutes";
import { getPriorityIcon } from "@/lib/priority";

type TodayTaskRowProps = {
  id: string;
  title: string;
  priority: string;
  isDone: boolean;
  projectName: string;
  projectIcon: string | null;
  estimate: number | null;
  /** Ausente: la fila no ancla una hora -vencido sin planificar, hecha-. */
  startMinute?: number | null;
  /** Ausente: nada que restar de la estimacion. */
  loggedSeconds?: number;
  running: boolean;
  onToggleTimer: () => void;
  onOpen: () => void;
  onToggleDone: (done: boolean) => void;
  /** Presente en "De dias anteriores" y "Plan de hoy". */
  onEstimateChange?: (seconds: number | null) => void;
  /** "Añadir a hoy" o "Planificar hoy", segun la seccion. */
  action?: { label: string; onClick: () => void };
  /** «Vence hoy» / «Vencida», cuando no hay estimacion editable que mostrar. */
  dueBadge?: "today" | "overdue";
};

/**
 * La fila de Hoy (ADR 046): casilla de hecha, cronometro, hora si esta
 * anclada, titulo, proyecto y -a la derecha- lo que toque segun la seccion:
 * la estimacion editable, un aviso de vencimiento o una accion de planificar.
 * Comparte `TimerButton` e `InlineEstimate` con el Planificador y el pie de
 * la barra lateral (ADR 044, ADR 045) para que la misma tarea se vea igual en
 * todos lados.
 */
export function TodayTaskRow({
  id,
  title,
  priority,
  isDone,
  projectName,
  projectIcon,
  estimate,
  startMinute,
  loggedSeconds,
  running,
  onToggleTimer,
  onOpen,
  onToggleDone,
  onEstimateChange,
  action,
  dueBadge,
}: TodayTaskRowProps) {
  const { t, i18n } = useTranslation();
  const ProjectIcon =
    projectIcons[projectIcon as keyof typeof projectIcons] ?? Layout;

  return (
    <div
      data-testid={`today-row-${id}`}
      className={cn(
        "group flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors duration-(--motion-fast) ease-out-quart hover:bg-accent",
        running && "bg-warning/8 hover:bg-warning/12",
      )}
    >
      <Checkbox
        checked={isDone}
        onCheckedChange={(checked) => onToggleDone(checked === true)}
        aria-label={t("today:row.toggleDone")}
      />

      <TimerButton
        running={running}
        onClick={onToggleTimer}
        label={t(running ? "timer:stop" : "timer:start")}
        disabled={isDone}
      />

      {startMinute != null && (
        <span className="shrink-0 font-mono text-meta text-muted-foreground tabular-nums">
          {fromMinutes(startMinute)}
        </span>
      )}

      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-1.5 text-left outline-none"
      >
        <span className="shrink-0">{getPriorityIcon(priority)}</span>
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-body",
            isDone && "text-muted-foreground line-through",
          )}
        >
          {title}
        </span>
      </button>

      <span className="hidden shrink-0 items-center gap-1 text-meta text-muted-foreground sm:flex">
        <ProjectIcon className="size-3" />
        <span className="max-w-28 truncate">{projectName}</span>
      </span>

      {onEstimateChange ? (
        <InlineEstimate
          estimate={estimate}
          loggedSeconds={loggedSeconds ?? 0}
          onSave={onEstimateChange}
          disabled={isDone}
        />
      ) : dueBadge ? (
        <span
          className={cn(
            "shrink-0 rounded px-1.5 py-0.5 text-label",
            dueBadge === "overdue"
              ? "bg-destructive/10 text-destructive-foreground"
              : "bg-warning/10 text-warning-foreground",
          )}
        >
          {t(`today:row.due.${dueBadge}`)}
        </span>
      ) : loggedSeconds != null ? (
        <span className="shrink-0 font-mono text-meta text-muted-foreground tabular-nums">
          {formatDuration(loggedSeconds, i18n.language)}
        </span>
      ) : null}

      {action && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            action.onClick();
          }}
          className="shrink-0 rounded px-1.5 py-0.5 text-label text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100 group-focus-within:opacity-100"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
