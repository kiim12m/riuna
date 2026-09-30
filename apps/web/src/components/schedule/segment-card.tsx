import { Layout, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import projectIcons from "@/constants/project-icons";
import { cn } from "@/lib/cn";
import { getPriorityIcon } from "@/lib/priority";
import {
  clampMinute,
  formatClock,
  minutesToPx,
  pxToMinutes,
  type ResizeEdge,
  resizeSegment,
  snapMinute,
} from "./schedule-timeline";

type SegmentTask = {
  id: string;
  title: string;
  priority: string;
  projectIcon: string | null;
  projectName: string;
  isDone: boolean;
  /** Nulo o 0: sin estimar. El tramo ya viene con 30 min reservados
   * (`UNESTIMATED_ENTRY_SECONDS`), pero se pinta distinto para que se note. */
  estimate: number | null;
};

export type ResizeInfo = {
  /** Segundos que sumar (o restar) a `task.estimate`. */
  deltaSeconds: number;
  /** Solo al arrastrar el borde superior: la tarea tambien queda anclada aqui. */
  startMinute?: number;
};

type ScheduleSegmentCardProps = {
  task: SegmentTask;
  /** `yyyy-mm-dd` de la columna en la que vive hoy este tramo. */
  dayKey: string;
  /** Minuto real del dia (0-1439), nunca relativo a la rejilla. */
  startMinute: number;
  durationMinutes: number;
  isPinned: boolean;
  conflict?: boolean;
  truncated?: boolean;
  /** Borde superior: solo tiene sentido en un tramo anclado o en la primera
   * parte de uno que fluye -partir mas seguido no habria donde anclar. */
  canResizeTop: boolean;
  /** Borde inferior: igual, pero con la ultima parte. */
  canResizeBottom: boolean;
  /** Minuto real en el que arranca la rejilla visible: solo para posicionar. */
  gridStart: number;
  /** Limites de ARRASTRAR (mover el tramo entero), en minuto real -normalmente
   * los bordes de la rejilla-. */
  minMinute: number;
  maxMinute: number;
  /** Limites de REDIMENSIONAR: el bloqueador fijo vecino mas cercano, no el
   * dia entero -`time-grid.tsx#nearestBlockBounds`-. Distintos de
   * `minMinute`/`maxMinute`: mover el tramo entero encima de un bloque sigue
   * dejandolo en conflicto, como siempre; alargarlo hasta pisarlo, no. */
  resizeMinMinute: number;
  resizeMaxMinute: number;
  /** De la API (`minEntrySeconds`/60), no de una constante local. */
  minDurationMinutes: number;
  onOpen: () => void;
  onMove: (minute: number) => void;
  /** Se soltó sobre otra columna (vista Semana): ancla ahi, en vez de en la
   * propia. */
  onMoveDay: (dayKey: string, minute: number) => void;
  onUnpin?: () => void;
  onResize: (info: ResizeInfo) => void;
  /** Avisa a la rejilla mientras se mueve o redimensiona este tramo, para
   * que calle el hueco de crear tarea -sin esto, el puntero pasa por encima
   * del fondo de la columna en pleno arrastre y la casilla discontinua
   * aparece superpuesta al tramo que se esta tocando. */
  onInteractionChange: (interacting: boolean) => void;
  /** Mientras se arrastra sobre otra columna (vista Semana): a que dia y
   * minuto caeria si se soltara ahora, o `null` en cuanto vuelve a la
   * propia columna o se suelta. `time-grid.tsx` lo usa para pintar la
   * sombra (`drag-ghost.tsx`) en la columna de destino -este componente no
   * puede pintar fuera de si mismo. */
  onCrossDayDrag: (
    target: { dayKey: string; startMinute: number } | null,
  ) => void;
};

const MOVE_THRESHOLD_PX = 4;
const RESIZE_HANDLE_PX = 6;

/** La columna bajo un punto de la pantalla, leyendo el `data-day-key` que
 * `time-grid.tsx` pone en el contenedor de cada rejilla. `null` fuera de
 * cualquier columna (la cabecera de horas, por ejemplo): quedarse en el
 * propio dia es mas seguro que adivinar uno. */
function dayKeyAtPoint(x: number, y: number): string | null {
  const el = document.elementFromPoint(x, y);
  return el?.closest<HTMLElement>("[data-day-key]")?.dataset.dayKey ?? null;
}

/**
 * Un tramo del Cronograma: puntero continuo como `gantt-task-bar.tsx`, pero
 * en el eje Y de un solo dia en vez del X de varios (ADR 041). Arrastrar
 * ancla la hora (`start_minute`); "liberar hora" es un boton, no un gesto —
 * mas facil de encontrar que exigir soltar en una zona concreta. En la vista
 * Semana, arrastrar sobre otra columna tambien mueve el dia
 * (`dayKeyAtPoint`): la coordenada vertical se calcula igual da la columna
 * que sea, asi que solo hace falta averiguar de quien es el punto de soltar.
 */
export function ScheduleSegmentCard({
  task,
  dayKey,
  startMinute,
  durationMinutes,
  isPinned,
  conflict = false,
  truncated = false,
  canResizeTop,
  canResizeBottom,
  gridStart,
  minMinute,
  maxMinute,
  resizeMinMinute,
  resizeMaxMinute,
  minDurationMinutes,
  onOpen,
  onMove,
  onMoveDay,
  onUnpin,
  onResize,
  onInteractionChange,
  onCrossDayDrag,
}: ScheduleSegmentCardProps) {
  const { t } = useTranslation();
  const [dragMinute, setDragMinute] = useState<number | null>(null);
  const [crossDayKey, setCrossDayKey] = useState<string | null>(null);
  const [resizeState, setResizeState] = useState<{
    startMinute: number;
    durationMinutes: number;
  } | null>(null);

  useEffect(() => {
    if (dragMinute !== null && dragMinute === startMinute) setDragMinute(null);
  }, [dragMinute, startMinute]);

  useEffect(() => {
    if (
      resizeState !== null &&
      resizeState.startMinute === startMinute &&
      resizeState.durationMinutes === durationMinutes
    ) {
      setResizeState(null);
    }
  }, [resizeState, startMinute, durationMinutes]);

  // "Se va" a otro dia (la sombra en destino la pinta `drag-ghost.tsx`, en
  // esa columna): aqui solo queda la marca del hueco que deja. "Se levanta"
  // dentro del mismo dia: sombra y anillo para que se note que esta agarrado.
  const isLeaving = crossDayKey !== null;
  const isLifted = dragMinute !== null && !isLeaving;
  // Mientras se va a otro dia, el propio tramo se queda quieto en su sitio
  // -solo la sombra de destino sigue al puntero-; seguirlo con `dragMinute`
  // aqui tambien haria que subiera y bajara con el, que es justo lo que no
  // se quiere en cuanto ya no va a quedarse en esta columna.
  const displayMinute =
    resizeState?.startMinute ??
    (isLeaving ? startMinute : dragMinute) ??
    startMinute;
  const displayDuration = resizeState?.durationMinutes ?? durationMinutes;
  const top = minutesToPx(displayMinute - gridStart);
  const height = Math.max(minutesToPx(displayDuration), 18);
  const isEstimated = task.estimate != null;

  const ProjectIcon =
    projectIcons[task.projectIcon as keyof typeof projectIcons] ?? Layout;

  const handleResizePointerDown =
    (edge: ResizeEdge) => (event: React.PointerEvent) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const originY = event.clientY;
      onInteractionChange(true);

      const resolve = (clientY: number) =>
        resizeSegment(edge, startMinute, durationMinutes, clientY - originY, {
          min: resizeMinMinute,
          max: resizeMaxMinute,
          minDuration: minDurationMinutes,
        });

      const move = (ev: PointerEvent) => setResizeState(resolve(ev.clientY));
      const up = (ev: PointerEvent) => {
        detach();
        onInteractionChange(false);
        const result = resolve(ev.clientY);
        setResizeState(result);
        const deltaSeconds = (result.durationMinutes - durationMinutes) * 60;
        if (deltaSeconds === 0 && result.startMinute === startMinute) return;
        onResize(
          edge === "top"
            ? { deltaSeconds, startMinute: result.startMinute }
            : { deltaSeconds },
        );
      };
      const detach = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    };

  const handlePointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const originY = event.clientY;
    const originMinute = startMinute;
    const maxStart = Math.max(minMinute, maxMinute - durationMinutes);
    onInteractionChange(true);

    const resolve = (clientY: number) =>
      clampMinute(
        snapMinute(originMinute + pxToMinutes(clientY - originY)),
        minMinute,
        maxStart,
      );

    const move = (ev: PointerEvent) => {
      const next = resolve(ev.clientY);
      setDragMinute(next);
      const target = dayKeyAtPoint(ev.clientX, ev.clientY);
      const crossTarget =
        target && target !== dayKey
          ? { dayKey: target, startMinute: next }
          : null;
      setCrossDayKey(crossTarget?.dayKey ?? null);
      onCrossDayDrag(crossTarget);
    };
    const up = (ev: PointerEvent) => {
      detach();
      onInteractionChange(false);
      const targetDay = dayKeyAtPoint(ev.clientX, ev.clientY);
      setCrossDayKey(null);
      onCrossDayDrag(null);
      const movedDay = targetDay && targetDay !== dayKey;
      if (!movedDay && Math.abs(ev.clientY - originY) < MOVE_THRESHOLD_PX) {
        setDragMinute(null);
        onOpen();
        return;
      }
      const next = resolve(ev.clientY);
      if (movedDay) {
        onMoveDay(targetDay, next);
        return;
      }
      if (next === startMinute) {
        setDragMinute(null);
        return;
      }
      onMove(next);
    };
    const detach = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  return (
    <div
      data-testid={`schedule-segment-${task.id}`}
      data-pinned={isPinned}
      className={cn(
        "group absolute inset-x-1 overflow-hidden rounded-md shadow-xs",
        // `border` a secas (1 px) apenas distingue un punteado de una linea
        // continua; `border-2` deja puntos que de verdad se ven como tales.
        isEstimated ? "border" : "border-2 border-dotted",
        // Se atenua y pasa a vora discontinua mientras se arrastra hacia
        // otro dia: la propia columna no cambia, asi que esto es la unica
        // senal de que el hueco se esta quedando vacio. Va despues del
        // border-style de arriba: `cn()` (tailwind-merge) resuelve el
        // choque de grupo por orden, sin falta de `!important`.
        isLeaving && "border-dashed opacity-40",
        // Se "levanta" del resto mientras se mueve dentro del mismo dia.
        isLifted && "z-30 shadow-lg ring-2 ring-brand/40",
        isPinned
          ? isEstimated
            ? "bg-brand/10"
            : "bg-brand/5"
          : isEstimated
            ? "bg-background"
            : "bg-muted/20",
        conflict
          ? "border-destructive/60"
          : truncated
            ? "border-dashed border-warning-foreground/60"
            : !isEstimated
              ? "border-border/50"
              : "border-border/70",
      )}
      style={{ top, height }}
    >
      {/** biome-ignore lint/a11y/useSemanticElements: sostiene el tramo entero y el arrastre de puntero */}
      <div
        role="button"
        tabIndex={0}
        aria-label={task.title}
        onPointerDown={handlePointerDown}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpen();
          }
        }}
        className="flex h-full w-full cursor-grab flex-col gap-0.5 p-1 text-left outline-none active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex items-center gap-1">
          <span className="shrink-0">{getPriorityIcon(task.priority)}</span>
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-meta",
              (task.isDone || !isEstimated) && "text-muted-foreground",
              task.isDone && "line-through",
            )}
            title={!isEstimated ? t("schedule:noEstimate") : undefined}
          >
            {task.title}
          </span>
        </div>
        {height > 30 && (
          <div className="flex items-center gap-1 text-meta text-muted-foreground">
            <ProjectIcon className="size-3 shrink-0" />
            <span className="truncate">{task.projectName}</span>
            <span className="ml-auto shrink-0">
              {formatClock(displayMinute)}
            </span>
          </div>
        )}
      </div>
      {resizeState && (
        <div className="-translate-x-1/2 absolute bottom-1 left-1/2 whitespace-nowrap rounded bg-foreground px-1.5 py-0.5 font-medium text-background text-meta shadow">
          {formatClock(displayMinute)} –{" "}
          {formatClock(displayMinute + displayDuration)}
        </div>
      )}
      {isPinned && onUnpin && (
        <button
          type="button"
          onClick={onUnpin}
          className="absolute top-0.5 right-0.5 hidden rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground group-hover:block"
        >
          <X className="size-3" />
        </button>
      )}
      {/* Asas para cambiar la duracion arrastrando un borde: puntero solo,
       * como el cuerpo del tramo -Enter/Espacio ya cubre abrir la tarea, no
       * hay equivalente de teclado para redimensionar. `stopPropagation` en
       * su pointerdown evita que dispare tambien el arrastre de mover. */}
      {canResizeBottom && (
        <div
          aria-hidden="true"
          title={t("schedule:resizeHandle")}
          onPointerDown={handleResizePointerDown("bottom")}
          className="absolute inset-x-0 bottom-0 flex cursor-ns-resize items-end justify-center"
          style={{ height: RESIZE_HANDLE_PX }}
        >
          <div className="mb-px h-0.5 w-6 rounded-full bg-foreground/30 opacity-0 group-hover:opacity-100" />
        </div>
      )}
      {canResizeTop && (
        <div
          aria-hidden="true"
          title={t("schedule:resizeHandle")}
          onPointerDown={handleResizePointerDown("top")}
          className="absolute inset-x-0 top-0 flex cursor-ns-resize items-start justify-center"
          style={{ height: RESIZE_HANDLE_PX }}
        >
          <div className="mt-px h-0.5 w-6 rounded-full bg-foreground/30 opacity-0 group-hover:opacity-100" />
        </div>
      )}
    </div>
  );
}
