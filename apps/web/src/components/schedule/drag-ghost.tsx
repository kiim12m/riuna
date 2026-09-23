import { formatClock, minutesToPx } from "./schedule-timeline";

/**
 * Donde caera un tramo que se arrastra a la columna de otro dia (vista
 * Semana): la columna de origen no puede pintarlo fuera de si misma, asi que
 * la de destino dibuja esta sombra. Solo decorativa -el puntero lo sigue
 * llevando `segment-card.tsx`-.
 */
export function DragGhost({
  title,
  startMinute,
  durationMinutes,
  gridStart,
}: {
  title: string;
  startMinute: number;
  durationMinutes: number;
  gridStart: number;
}) {
  return (
    <div
      data-testid="schedule-drag-ghost"
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-1 z-30 flex flex-col gap-0.5 overflow-hidden rounded-md border-2 border-brand border-dashed bg-brand/10 p-1 shadow-lg"
      style={{
        top: minutesToPx(startMinute - gridStart),
        height: Math.max(minutesToPx(durationMinutes), 18),
      }}
    >
      <span className="truncate font-medium text-meta">{title}</span>
      <span className="text-brand text-meta">
        {formatClock(startMinute)} –{" "}
        {formatClock(startMinute + durationMinutes)}
      </span>
    </div>
  );
}
