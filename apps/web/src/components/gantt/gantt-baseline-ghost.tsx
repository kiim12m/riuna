import { useTranslation } from "react-i18next";
import { formatDateShort } from "@/lib/format";
import { barHeightRem, barMetrics, type GanttTimeline } from "./gantt-timeline";

/**
 * Donde estaba la barra en la linea base (ADR 085): una franja discontinua
 * justo debajo de la de ahora, para ver de un vistazo cuanto se movio sin
 * tapar la barra que se arrastra.
 */
export function GanttBaselineGhost({
  start,
  end,
  depth,
  timeline,
}: {
  start: Date;
  end: Date;
  depth: number;
  timeline: GanttTimeline;
}) {
  const { t } = useTranslation();
  const { left, width } = barMetrics(start, end, timeline);
  const barHeight = barHeightRem(depth);

  return (
    <div
      title={t("tasks:baseline.ghost", {
        start: formatDateShort(start),
        end: formatDateShort(end),
      })}
      data-testid="gantt-baseline-ghost"
      className="pointer-events-auto absolute z-[1] h-1 rounded-full border border-muted-foreground/70 border-dashed bg-muted-foreground/15"
      style={{ left, width, top: `calc(50% + ${barHeight} / 2 + 2px)` }}
    />
  );
}
