import { addDays, differenceInCalendarDays, startOfDay } from "date-fns";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useUpdateTask } from "@/hooks/mutations/task/use-update-task";
import { cn } from "@/lib/cn";
import { toast } from "@/lib/toast";
import type Task from "@/types/task";
import { barHeightRem, barMetrics, type GanttTimeline } from "./gantt-timeline";

const CLICK_MOVE_THRESHOLD_PX = 4;
const MOBILE_MOVE_THRESHOLD_PX = 14;

export type ScheduledTask = Task & {
  scheduleStart: Date;
  scheduleEnd: Date;
};

type GanttTaskBarProps = {
  task: ScheduledTask;
  depth: number;
  isDone: boolean;
  timeline: GanttTimeline;
  isMobile?: boolean;
  onOpenTask: () => void;
  /**
   * Sin arrastre ni redimensionado: solo abre la tarea al pulsar. Lo usa el
   * Gantt personal de "Mis tareas" (ADR 039), que todavia no tiene un destino
   * con sentido para un arrastre entre proyectos.
   */
  readOnly?: boolean;
};

function toIsoDay(date: Date) {
  return startOfDay(date).toISOString();
}

function clampIndex(index: number, min: number, max: number) {
  return Math.max(min, Math.min(index, max));
}

export function GanttTaskBar({
  task,
  depth,
  isDone,
  timeline,
  isMobile = false,
  onOpenTask,
  readOnly = false,
}: GanttTaskBarProps) {
  const { t } = useTranslation();
  const { mutateAsync: updateTask } = useUpdateTask();
  const [dragDisplay, setDragDisplay] = useState<{
    start: Date;
    end: Date;
  } | null>(null);

  // Soltar el overlay optimista cuando el servidor confirma las mismas fechas.
  useEffect(() => {
    if (!dragDisplay) return;
    const startMatches =
      differenceInCalendarDays(task.scheduleStart, dragDisplay.start) === 0;
    const endMatches =
      differenceInCalendarDays(task.scheduleEnd, dragDisplay.end) === 0;
    if (startMatches && endMatches) setDragDisplay(null);
  }, [dragDisplay, task.scheduleEnd, task.scheduleStart]);

  const displayStart = dragDisplay?.start ?? task.scheduleStart;
  const displayEnd = dragDisplay?.end ?? task.scheduleEnd;

  const { rangeStart, totalDays, pixelsPerDay } = timeline;
  const pxPerDay = Math.max(pixelsPerDay, 1e-6);
  const moveThresholdPx = isMobile
    ? MOBILE_MOVE_THRESHOLD_PX
    : CLICK_MOVE_THRESHOLD_PX;

  const { left, width } = barMetrics(displayStart, displayEnd, timeline);
  const barHeight = barHeightRem(depth);

  const persistDates = useCallback(
    async (nextStart: Date, nextEnd: Date): Promise<boolean> => {
      try {
        await updateTask({
          ...task,
          startDate: toIsoDay(nextStart),
          dueDate: toIsoDay(nextEnd),
        });
        return true;
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : t("tasks:gantt.updateDatesError"),
        );
        return false;
      }
    },
    [task, updateTask, t],
  );

  const startIdx = differenceInCalendarDays(task.scheduleStart, rangeStart);
  const endIdx = differenceInCalendarDays(task.scheduleEnd, rangeStart);
  const durationDays = endIdx - startIdx;

  const bindWindowDrag = (
    onMove: (deltaDays: number) => void,
    // `movedPx` es el recorrido real del puntero: el que decide si el gesto ha
    // sido un clic no puede salir de los dias redondeados, que en la escala de
    // Dia convierten 15 px en un dia y en la de Trimestre un dia en 1 px.
    onEnd: (deltaDays: number, cancelled: boolean, movedPx: number) => void,
    originX: number,
  ) => {
    const toDelta = (clientX: number) =>
      Math.round((clientX - originX) / pxPerDay);
    const move = (ev: PointerEvent) => onMove(toDelta(ev.clientX));
    const up = (ev: PointerEvent) => {
      detach();
      onEnd(
        toDelta(ev.clientX),
        ev.type === "pointercancel",
        Math.abs(ev.clientX - originX),
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

  const handleResizeStart = (event: React.PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    bindWindowDrag(
      (delta) => {
        const idx = clampIndex(startIdx + delta, 0, endIdx);
        setDragDisplay({
          start: addDays(rangeStart, idx),
          end: task.scheduleEnd,
        });
      },
      async (delta, cancelled) => {
        if (cancelled) return setDragDisplay(null);
        const idx = clampIndex(startIdx + delta, 0, endIdx);
        const nextStart = addDays(rangeStart, idx);
        if (nextStart.getTime() === task.scheduleStart.getTime()) {
          return setDragDisplay(null);
        }
        if (!(await persistDates(nextStart, task.scheduleEnd)))
          setDragDisplay(null);
      },
      event.clientX,
    );
  };

  const handleResizeEnd = (event: React.PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    bindWindowDrag(
      (delta) => {
        const idx = clampIndex(endIdx + delta, startIdx, totalDays - 1);
        setDragDisplay({
          start: task.scheduleStart,
          end: addDays(rangeStart, idx),
        });
      },
      async (delta, cancelled) => {
        if (cancelled) return setDragDisplay(null);
        const idx = clampIndex(endIdx + delta, startIdx, totalDays - 1);
        const nextEnd = addDays(rangeStart, idx);
        if (nextEnd.getTime() === task.scheduleEnd.getTime()) {
          return setDragDisplay(null);
        }
        if (!(await persistDates(task.scheduleStart, nextEnd)))
          setDragDisplay(null);
      },
      event.clientX,
    );
  };

  const handleMove = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const originX = event.clientX;
    bindWindowDrag(
      (delta) => {
        const idx = clampIndex(
          startIdx + delta,
          0,
          totalDays - 1 - durationDays,
        );
        const nextStart = addDays(rangeStart, idx);
        setDragDisplay({
          start: nextStart,
          end: addDays(nextStart, durationDays),
        });
      },
      async (delta, cancelled, movedPx) => {
        if (cancelled) return setDragDisplay(null);
        if (movedPx < moveThresholdPx) {
          setDragDisplay(null);
          onOpenTask();
          return;
        }
        const idx = clampIndex(
          startIdx + delta,
          0,
          totalDays - 1 - durationDays,
        );
        const nextStart = addDays(rangeStart, idx);
        const nextEnd = addDays(nextStart, durationDays);
        if (
          nextStart.getTime() === task.scheduleStart.getTime() &&
          nextEnd.getTime() === task.scheduleEnd.getTime()
        ) {
          return setDragDisplay(null);
        }
        if (!(await persistDates(nextStart, nextEnd))) setDragDisplay(null);
      },
      originX,
    );
  };

  // Corchete de la rama: solo cuando el subarbol se sale del tramo propio del
  // padre. Si el padre ya abarca a sus hijas, repetir la franja seria ruido.
  const subtree = task.subtree ?? null;
  const summaryStart = subtree?.startDate ? new Date(subtree.startDate) : null;
  const summaryEnd = subtree?.dueDate ? new Date(subtree.dueDate) : null;
  const branch =
    subtree &&
    subtree.descendantCount > 0 &&
    summaryStart &&
    summaryEnd &&
    (subtree.inheritsStartDate || subtree.inheritsDueDate)
      ? barMetrics(summaryStart, summaryEnd, timeline)
      : null;

  const showProgress = subtree != null && subtree.descendantCount > 0;
  const handleClasses =
    "relative z-10 w-2 shrink-0 cursor-ew-resize touch-none bg-brand/55 opacity-0 transition-opacity duration-150 before:absolute before:-inset-y-2 before:inset-x-0 before:content-[''] group-hover/bar:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <>
      {branch && (
        <div
          aria-hidden="true"
          title={t("tasks:gantt.branchSpan")}
          className="pointer-events-none absolute z-[1] h-1 rounded-t-[3px] border-x-[1.5px] border-t-[1.5px] border-brand/45"
          style={{
            left: branch.left,
            width: branch.width,
            top: `calc(50% - ${barHeight} / 2 - 5px)`,
          }}
        />
      )}
      <div
        className={cn(
          "group/bar pointer-events-auto absolute top-1/2 z-[2] flex -translate-y-1/2 items-stretch rounded-full bg-brand/22 transition-[background-color,box-shadow] duration-150 ease-out",
          "hover:bg-brand/32 hover:shadow-e2",
          isDone && "opacity-50",
        )}
        style={{ left, width, height: barHeight }}
      >
        {showProgress && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 rounded-l-full bg-brand/45"
            style={{ width: `${subtree?.progress ?? 0}%` }}
          />
        )}
        {!readOnly && (
          <button
            type="button"
            aria-label={t("tasks:gantt.resizeStart")}
            onPointerDown={handleResizeStart}
            className={cn(handleClasses, "rounded-l-full")}
          />
        )}
        <button
          type="button"
          aria-label={t(
            readOnly
              ? "tasks:gantt.taskAriaLabelReadOnly"
              : "tasks:gantt.taskAriaLabel",
            { title: task.title },
          )}
          onPointerDown={readOnly ? undefined : handleMove}
          onClick={readOnly ? onOpenTask : undefined}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onOpenTask();
            }
          }}
          className={cn(
            "relative z-[1] min-w-0 flex-1 touch-manipulation rounded-full outline-none before:absolute before:inset-x-0 before:-inset-y-2 before:content-[''] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
            readOnly ? "cursor-pointer" : "cursor-grab active:cursor-grabbing",
          )}
        />
        {!readOnly && (
          <button
            type="button"
            aria-label={t("tasks:gantt.resizeDue")}
            onPointerDown={handleResizeEnd}
            className={cn(handleClasses, "rounded-r-full")}
          />
        )}
      </div>
    </>
  );
}
