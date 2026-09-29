import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { WeekStartsOn } from "@/components/calendar/month-grid-model";
import type { ScheduleDay, ScheduleSegment } from "@/fetchers/schedule";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { CreateTaskPlaceholder } from "./create-task-placeholder";
import { formatClock } from "./schedule-timeline";

const MAX_VISIBLE_ITEMS = 3;

type MonthItem =
  | {
      kind: "task";
      segment: Extract<ScheduleSegment, { type: "flow" | "pinned" }>;
    }
  | { kind: "block"; segment: Extract<ScheduleSegment, { type: "block" }> };

/** Exportada para probarla aparte: un bloque solapado con el cronometro en
 * marcha (`mergeBlockers`, `layout.ts`) funde las dos entradas en un mismo
 * tramo -mirar solo `entries[0]` escondia el bloque real entero cuando el
 * cronometro ordenaba primero. `some(...)` en vez de mirar un unico indice. */
export function itemsFor(day: ScheduleDay | undefined): MonthItem[] {
  if (!day) return [];
  return day.segments
    .filter(
      (segment) =>
        segment.type !== "block" ||
        segment.entries.some((entry) => entry.kind !== "running"),
    )
    .map((segment) =>
      segment.type === "block"
        ? ({ kind: "block", segment } satisfies MonthItem)
        : ({ kind: "task", segment } satisfies MonthItem),
    );
}

/**
 * Vista Mes del Cronograma (ADR 041, actualizacion 2026-09-23): igual que
 * `schedule-month.component.html` de super-productivity, una celda por dia
 * con hasta tres entradas y "+N" para el resto. Sin eje horario -aqui
 * "crear" siempre planea "para el dia", sin ancla, como `isForDayMode` en el
 * original.
 */
export function MonthView({
  workspaceId,
  weeks,
  daysByKey,
  referenceMonth,
  weekStartsOn,
  onOpen,
  onSelectDay,
}: {
  workspaceId: string;
  weeks: string[][];
  daysByKey: Map<string, ScheduleDay>;
  referenceMonth: Date;
  weekStartsOn: WeekStartsOn;
  onOpen: (segment: ScheduleSegment) => void;
  onSelectDay: (dayKey: string) => void;
}) {
  const { t } = useTranslation();
  const [editingDay, setEditingDay] = useState<string | null>(null);
  const month = referenceMonth.getMonth();

  const weekdayHeaders = Array.from({ length: 7 }, (_, index) => {
    const reference = new Date(2000, 0, 2 + ((weekStartsOn + index) % 7));
    return formatDate(reference, { weekday: "short" });
  });

  return (
    <div className="min-h-0 flex-1 overflow-auto p-4">
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-border/60 bg-border/60">
        {weekdayHeaders.map((label) => (
          <div
            key={label}
            className="bg-background px-2 py-1 text-center text-meta text-muted-foreground capitalize"
          >
            {label}
          </div>
        ))}

        {weeks.flat().map((dayKey) => {
          const day = daysByKey.get(dayKey);
          const date = new Date(`${dayKey}T00:00:00`);
          const isOtherMonth = date.getMonth() !== month;
          const isToday = day?.isToday ?? false;
          const items = itemsFor(day);
          const visible = items.slice(0, MAX_VISIBLE_ITEMS);
          const hiddenCount = items.length - visible.length;
          const isEditing = editingDay === dayKey;

          return (
            <div
              key={dayKey}
              className={cn(
                "group/cell relative flex min-h-24 flex-col gap-0.5 bg-background p-1",
                isOtherMonth && "opacity-40",
              )}
            >
              <button
                type="button"
                onClick={() => onSelectDay(dayKey)}
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center self-end rounded-full text-meta",
                  isToday
                    ? "bg-brand font-semibold text-brand-foreground"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                {date.getDate()}
              </button>

              <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden">
                {visible.map((item) =>
                  item.kind === "block" ? (
                    <div
                      key={`${item.segment.startSecond}-${item.segment.endSecond}`}
                      className="truncate rounded border border-dashed border-border/70 bg-muted/40 px-1 text-meta"
                    >
                      {item.segment.entries
                        .filter((entry) => entry.kind !== "running")
                        .map((entry) => entry.title)
                        .join(" / ")}
                    </div>
                  ) : (
                    <button
                      key={`${item.segment.taskId}-${item.segment.startSecond}`}
                      type="button"
                      onClick={() => onOpen(item.segment)}
                      className={cn(
                        "flex items-center gap-1 truncate rounded px-1 text-left text-meta hover:bg-muted",
                        item.segment.type === "pinned" && "bg-brand/10",
                        !item.segment.task?.estimate && "text-muted-foreground",
                      )}
                      title={
                        !item.segment.task?.estimate
                          ? t("schedule:noEstimate")
                          : undefined
                      }
                    >
                      {item.segment.type === "pinned" && (
                        <span className="shrink-0 text-muted-foreground">
                          {formatClock(item.segment.startSecond / 60)}
                        </span>
                      )}
                      <span className="truncate">
                        {item.segment.task?.title}
                      </span>
                    </button>
                  ),
                )}
                {hiddenCount > 0 && (
                  <button
                    type="button"
                    onClick={() => onSelectDay(dayKey)}
                    className="px-1 text-left text-meta text-muted-foreground hover:text-foreground hover:underline"
                  >
                    {t("schedule:month.more", { count: hiddenCount })}
                  </button>
                )}
              </div>

              {isEditing ? (
                <CreateTaskPlaceholder
                  workspaceId={workspaceId}
                  plannedDate={dayKey}
                  startMinute={null}
                  variant="day"
                  isEditing
                  onEditEnd={() => setEditingDay(null)}
                  className="static mt-auto"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingDay(dayKey)}
                  className="mt-auto shrink-0 truncate rounded border border-brand/70 border-dashed px-1 text-brand text-meta opacity-0 focus-visible:opacity-100 group-hover/cell:opacity-100"
                >
                  + {t("schedule:placeholder.clickToCreate")}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
