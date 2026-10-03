import { Layout, Star } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { TaskTimerButton } from "@/components/timer/task-timer-button";
import { Checkbox } from "@/components/ui/checkbox";
import projectIcons from "@/constants/project-icons";
import { cn } from "@/lib/cn";
import { getPriorityIcon } from "@/lib/priority";

type PlannerRowProps = {
  title: string;
  priority: string;
  isDone: boolean;
  projectName: string;
  projectIcon: string | null;
  onOpen: () => void;
  /** El hueco antes del titulo: nada, o el editor de hora anclada. */
  leading?: ReactNode;
  /** El hueco final: la estimacion editable, o una etiqueta de solo lectura. */
  trailing?: ReactNode;
  /**
   * La tarea, para el cronometro al final de la fila del titulo. Ausente en
   * las filas de solo lectura ("Vence este dia").
   */
  timerTask?: ComponentProps<typeof TaskTimerButton>["task"];
  /**
   * La casilla de "hecha" -`POST /task/complete/:id`, la misma de Hoy-.
   * Ausente en las filas de solo lectura y en la tarjeta que se arrastra.
   */
  onToggleDone?: (done: boolean) => void;
  /** Extiende o sustituye el borde/fondo -el arrastre trae los suyos. */
  className?: string;
  /** Imprescindible del dia (ADR 053): una estrella delante del titulo. */
  keyRank?: number | null;
  /** El boton «⋯» de `TaskRowActions`, detras del cronometro. */
  menu?: ReactNode;
};

/**
 * El cuerpo compartido de una fila del Planificador: icono de prioridad,
 * titulo, fila de proyecto y dos huecos -antes del titulo, al final de la
 * fila de proyecto- para lo que cambia entre secciones. Usan esto
 * `PlannerTaskCard` (arrastrable, envuelta en su propio `useSortable`),
 * `TimedEntryRow` ("Con hora": el hueco inicial lleva `TimePopover`) y
 * `DeadlineRow` ("Vence este dia": el hueco final lleva la etiqueta de solo
 * lectura en vez de `InlineEstimate`) en `planner-day.tsx` -antes cada una
 * reimplementaba el mismo marcado a mano-.
 */
export function PlannerRow({
  title,
  priority,
  isDone,
  projectName,
  projectIcon,
  onOpen,
  leading,
  trailing,
  timerTask,
  onToggleDone,
  className,
  keyRank,
  menu,
}: PlannerRowProps) {
  const { t } = useTranslation();
  const ProjectIcon =
    projectIcons[projectIcon as keyof typeof projectIcons] ?? Layout;

  return (
    // biome-ignore lint/a11y/useSemanticElements: sostiene contenido de bloque; los controles de dentro (TimePopover, InlineEstimate) ya son interactivos por su cuenta y paran su propia propagacion
    <div
      role="button"
      tabIndex={0}
      aria-label={title}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        "group space-y-1 rounded-md border bg-background p-1.5 text-left outline-none transition-[border-color,box-shadow] duration-150 ease-out focus-visible:ring-2 focus-visible:ring-ring",
        "border-border/70 hover:border-brand/45 hover:shadow-xs",
        className,
      )}
    >
      <div className="flex items-center gap-1.5">
        {onToggleDone && (
          // biome-ignore lint/a11y/noStaticElementInteractions: solo corta la propagacion hacia la fila, que se abre y se arrastra; el control es la casilla
          <span
            className="flex shrink-0"
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <Checkbox
              checked={isDone}
              onCheckedChange={(checked) => onToggleDone(checked === true)}
              aria-label={t("today:row.toggleDone")}
            />
          </span>
        )}
        {leading}
        {keyRank != null && (
          <Star
            className="size-3 shrink-0 fill-current text-warning"
            aria-label={t("taskActions:key")}
          />
        )}
        <span className="shrink-0">{getPriorityIcon(priority)}</span>
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-body",
            isDone && "text-muted-foreground line-through",
          )}
        >
          {title}
        </span>
        {timerTask && <TaskTimerButton task={timerTask} reveal="hover" />}
        {menu}
      </div>
      <div className="flex items-center gap-1 text-meta text-muted-foreground">
        <ProjectIcon className="size-3 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{projectName}</span>
        {trailing}
      </div>
    </div>
  );
}
