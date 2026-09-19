import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";
import type { ScheduledTask } from "./gantt-task-bar";
import { barMetrics, type GanttTimeline } from "./gantt-timeline";

export type ProjectTaskRelation = {
  id: string;
  sourceTaskId: string;
  targetTaskId: string;
  relationType: string;
};

type GanttDependencyLayerProps = {
  rows: { task: ScheduledTask }[];
  relations: ProjectTaskRelation[];
  timeline: GanttTimeline;
  rowHeightPx: number;
  leftOffset: string;
  className?: string;
};

// Conectores fin -> inicio de las relaciones `blocks` que ya existan. Solo
// lectura: crearlas o editarlas es Fase 6. Se dibujan sobre la geometria que
// deriva del propio `timeline` (no del DOM), asi que salen bien en cualquier
// zoom sin medir ni re-renderizar por efectos.
export function GanttDependencyLayer({
  rows,
  relations,
  timeline,
  rowHeightPx,
  leftOffset,
  className,
}: GanttDependencyLayerProps) {
  const { t } = useTranslation();

  const segments = useMemo(() => {
    if (rowHeightPx <= 0) return [];

    const geom = new Map<string, { x1: number; x2: number; cy: number }>();
    const titleById = new Map<string, string>();
    rows.forEach(({ task }, index) => {
      const { left, width } = barMetrics(
        task.scheduleStart,
        task.scheduleEnd,
        timeline,
      );
      geom.set(task.id, {
        x1: left,
        x2: left + width,
        cy: index * rowHeightPx + rowHeightPx / 2,
      });
      titleById.set(task.id, task.title);
    });

    const gap = 9;
    const head = 5;

    return relations.flatMap((relation) => {
      if (relation.relationType !== "blocks") return [];
      if (relation.sourceTaskId === relation.targetTaskId) return [];
      const from = geom.get(relation.sourceTaskId);
      const to = geom.get(relation.targetTaskId);
      if (!from || !to) return [];

      const x1 = from.x2;
      const y1 = from.cy;
      const x2 = to.x1;
      const y2 = to.cy;

      const path =
        x2 >= x1 + gap * 2
          ? `M${x1} ${y1} H${x1 + gap} V${y2} H${x2 - head}`
          : `M${x1} ${y1} h${gap} V${(y1 + y2) / 2} H${x2 - gap} V${y2} H${x2 - head}`;

      return [
        {
          key: relation.id,
          path,
          arrow: `${x2},${y2} ${x2 - head},${y2 - 3} ${x2 - head},${y2 + 3}`,
          title: t("tasks:gantt.dependencyBlocks", {
            source:
              titleById.get(relation.sourceTaskId) ?? relation.sourceTaskId,
            target:
              titleById.get(relation.targetTaskId) ?? relation.targetTaskId,
          }),
        },
      ];
    });
  }, [rows, relations, timeline, rowHeightPx, t]);

  if (segments.length === 0) return null;

  return (
    <div
      className={cn("pointer-events-none absolute inset-y-0", className)}
      style={{ left: leftOffset, width: `${timeline.trackWidthPx}px` }}
    >
      <svg
        className="h-full w-full overflow-visible text-muted-foreground/60"
        aria-hidden="true"
      >
        {segments.map((segment) => (
          <g key={segment.key}>
            <title>{segment.title}</title>
            <path
              d={segment.path}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
            />
            <polygon points={segment.arrow} fill="currentColor" />
          </g>
        ))}
      </svg>
    </div>
  );
}
