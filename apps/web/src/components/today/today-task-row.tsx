import { Star } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ProjectPill } from "@/components/task/project-pill";
import { InlineEstimate } from "@/components/timer/inline-estimate";
import { TimerButton } from "@/components/timer/timer-button";
import { Checkbox } from "@/components/ui/checkbox";
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
  /** Fila par de la lista: la cebra de la maqueta. La decide quien pinta la
   * lista, no `odd:`: la fila ordenable va envuelta en otro nodo. */
  shaded?: boolean;
  /** La que enseña el resumen de la derecha. */
  selected?: boolean;
  /** Imprescindible del dia, 1-3 (ADR 053): una estrella delante del titulo. */
  keyRank?: number | null;
  /** El boton «⋯» de `TaskRowActions`, al final de la fila. */
  menu?: ReactNode;
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
  shaded,
  selected,
  keyRank,
  menu,
}: TodayTaskRowProps) {
  const { t, i18n } = useTranslation();

  return (
    <div
      data-testid={`today-row-${id}`}
      aria-current={selected || undefined}
      className={cn(
        "group flex items-start gap-2.5 rounded-md px-2.5 py-2 transition-colors duration-(--motion-fast) ease-out-quart hover:bg-accent sm:items-center",
        // En este orden: la seleccion tapa la cebra, y el cronometro en
        // marcha tapa las dos -es lo que mas importa ver de un vistazo-.
        shaded && "bg-muted",
        selected && "bg-accent",
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

      {/* En movil el titulo va arriba, entero, y lo demas debajo: en una sola
       * linea, la etiqueta de vencimiento y la accion lo dejaban en dos
       * letras. En escritorio `sm:contents` deshace la columna. */}
      <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2.5">
        {/* El proyecto va dentro del boton y pegado al titulo, como en la
         * maqueta, y no empujado a la derecha: asi toda la franja central
         * sigue abriendo la tarea y el hueco final queda para la estimacion. */}
        <button
          type="button"
          onClick={onOpen}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {keyRank != null && (
            <Star
              className="size-3.5 shrink-0 fill-current text-warning"
              aria-label={t("taskActions:key")}
            />
          )}
          <span className="shrink-0">{getPriorityIcon(priority)}</span>
          <span
            className={cn(
              "line-clamp-2 min-w-0 text-body sm:truncate",
              isDone && "text-muted-foreground line-through",
            )}
          >
            {title}
          </span>
          <ProjectPill
            name={projectName}
            icon={projectIcon}
            className="ml-1 hidden sm:inline-flex"
          />
        </button>

        <div className="flex items-center gap-2 empty:hidden sm:contents">
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
              className="shrink-0 rounded px-1.5 py-0.5 text-label text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100 group-focus-within:opacity-100 touch:opacity-100"
            >
              {action.label}
            </button>
          )}
        </div>
      </div>

      {menu}
    </div>
  );
}
