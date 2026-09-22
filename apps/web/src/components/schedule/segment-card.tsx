import { Layout, X } from "lucide-react";
import { useEffect, useState } from "react";
import projectIcons from "@/constants/project-icons";
import { cn } from "@/lib/cn";
import { getPriorityIcon } from "@/lib/priority";
import {
  clampMinute,
  formatClock,
  minutesToPx,
  pxToMinutes,
  snapMinute,
} from "./schedule-timeline";

type SegmentTask = {
  id: string;
  title: string;
  priority: string;
  projectIcon: string | null;
  projectName: string;
  isDone: boolean;
};

type ScheduleSegmentCardProps = {
  task: SegmentTask;
  /** Minuto real del dia (0-1439), nunca relativo a la rejilla. */
  startMinute: number;
  durationMinutes: number;
  isPinned: boolean;
  conflict?: boolean;
  truncated?: boolean;
  /** Minuto real en el que arranca la rejilla visible: solo para posicionar. */
  gridStart: number;
  /** Limites de arrastre, en minuto real (normalmente los bordes de la rejilla). */
  minMinute: number;
  maxMinute: number;
  onOpen: () => void;
  onMove: (minute: number) => void;
  onUnpin?: () => void;
};

const MOVE_THRESHOLD_PX = 4;

/**
 * Un tramo del Cronograma: puntero continuo como `gantt-task-bar.tsx`, pero
 * en el eje Y de un solo dia en vez del X de varios (ADR 041). Arrastrar
 * ancla la hora (`start_minute`); "liberar hora" es un boton, no un gesto —
 * mas facil de encontrar que exigir soltar en una zona concreta.
 */
export function ScheduleSegmentCard({
  task,
  startMinute,
  durationMinutes,
  isPinned,
  conflict = false,
  truncated = false,
  gridStart,
  minMinute,
  maxMinute,
  onOpen,
  onMove,
  onUnpin,
}: ScheduleSegmentCardProps) {
  const [dragMinute, setDragMinute] = useState<number | null>(null);

  useEffect(() => {
    if (dragMinute !== null && dragMinute === startMinute) setDragMinute(null);
  }, [dragMinute, startMinute]);

  const displayMinute = dragMinute ?? startMinute;
  const top = minutesToPx(displayMinute - gridStart);
  const height = Math.max(minutesToPx(durationMinutes), 18);

  const ProjectIcon =
    projectIcons[task.projectIcon as keyof typeof projectIcons] ?? Layout;

  const handlePointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const originY = event.clientY;
    const originMinute = startMinute;
    const maxStart = Math.max(minMinute, maxMinute - durationMinutes);

    const resolve = (clientY: number) =>
      clampMinute(
        snapMinute(originMinute + pxToMinutes(clientY - originY)),
        minMinute,
        maxStart,
      );

    const move = (ev: PointerEvent) => setDragMinute(resolve(ev.clientY));
    const up = (ev: PointerEvent) => {
      detach();
      if (Math.abs(ev.clientY - originY) < MOVE_THRESHOLD_PX) {
        setDragMinute(null);
        onOpen();
        return;
      }
      const next = resolve(ev.clientY);
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
        "group absolute inset-x-1 overflow-hidden rounded-md border shadow-xs",
        isPinned ? "bg-brand/10" : "bg-background",
        conflict
          ? "border-destructive/60"
          : truncated
            ? "border-dashed border-warning-foreground/60"
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
              task.isDone && "text-muted-foreground line-through",
            )}
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
      {isPinned && onUnpin && (
        <button
          type="button"
          onClick={onUnpin}
          className="absolute top-0.5 right-0.5 hidden rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground group-hover:block"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}
