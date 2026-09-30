import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { AlarmClock, Flag, Layout } from "lucide-react";
import { useTranslation } from "react-i18next";
import { TimePopover } from "@/components/planner/time-popover";
import { InlineEstimate } from "@/components/timer/inline-estimate";
import projectIcons from "@/constants/project-icons";
import type {
  PlanDeadline,
  PlanEntry,
  PlanFixedBlock,
  PlanGhost,
} from "@/fetchers/planner";
import { cn } from "@/lib/cn";
import { fromMinutes } from "@/lib/minutes";
import { getPriorityIcon } from "@/lib/priority";
import { PlannerTaskCard } from "./task-card";

type TimedRow =
  | { kind: "entry"; minute: number; entry: PlanEntry }
  | { kind: "block"; minute: number; block: PlanFixedBlock };

/**
 * Un dia del Planificador, en las tres secciones de super-productivity
 * (ADR 045): sin hora (se reordena, cae en el primer hueco libre del
 * Cronograma en este mismo orden), con hora (alarma; tareas ancladas y citas
 * fijas, ordenadas por minuto, sin reordenar) y vence este dia (bandera,
 * solo lectura).
 */
export function PlannerDay({
  dayKey,
  label,
  loadPct,
  loadLabel,
  untimedEntries,
  timedEntries,
  fixedBlocks,
  ghosts,
  deadlines,
  onOpen,
  onEstimateChange,
  onAnchor,
  onUnanchor,
  timePopoverTaskId,
  onTimePopoverOpenChange,
}: {
  dayKey: string;
  label: string;
  loadPct: number;
  loadLabel: string;
  untimedEntries: PlanEntry[];
  timedEntries: PlanEntry[];
  fixedBlocks: PlanFixedBlock[];
  ghosts: PlanGhost[];
  deadlines: PlanDeadline[];
  onOpen: (task: { id: string; projectId: string }) => void;
  onEstimateChange: (taskId: string, seconds: number | null) => void;
  onAnchor: (taskId: string, minute: number) => void;
  onUnanchor: (taskId: string) => void;
  timePopoverTaskId: string | null;
  onTimePopoverOpenChange: (taskId: string, open: boolean) => void;
}) {
  const { t } = useTranslation();
  const untimedDroppable = useDroppable({ id: `${dayKey}:untimed` });
  const timedDroppable = useDroppable({ id: `${dayKey}:timed` });

  const timedRows: TimedRow[] = [
    ...timedEntries.map(
      (entry): TimedRow => ({
        kind: "entry",
        minute: entry.startMinute ?? 0,
        entry,
      }),
    ),
    ...fixedBlocks.map(
      (block): TimedRow => ({
        kind: "block",
        minute: block.startMinute,
        block,
      }),
    ),
  ].sort((a, b) => a.minute - b.minute);

  return (
    <div
      data-testid={`planner-column-${dayKey}`}
      className="flex h-full w-64 shrink-0 flex-col rounded-lg border border-border/60 bg-sidebar/40"
    >
      <div className="space-y-1 px-2 py-2">
        <h2 className="text-section">{label}</h2>
        <div className="h-1 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full",
              loadPct > 100 ? "bg-warning-foreground" : "bg-brand",
            )}
            style={{ width: `${Math.min(loadPct, 100)}%` }}
          />
        </div>
        <p className="text-meta text-muted-foreground">{loadLabel}</p>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-1.5 pb-2">
        {timedRows.length > 0 && (
          <div
            ref={timedDroppable.setNodeRef}
            className={cn(
              "space-y-1 rounded-md p-1",
              timedDroppable.isOver && "bg-brand/10",
            )}
          >
            <div className="flex items-center gap-1 px-1 text-meta text-muted-foreground">
              <AlarmClock className="size-3" />
            </div>
            {timedRows.map((row) =>
              row.kind === "entry" ? (
                <TimedEntryRow
                  key={row.entry.id}
                  entry={row.entry}
                  onOpen={() => onOpen(row.entry)}
                  onEstimateChange={(seconds) =>
                    onEstimateChange(row.entry.id, seconds)
                  }
                  onSaveTime={(minute) => onAnchor(row.entry.id, minute)}
                  onRemoveTime={() => onUnanchor(row.entry.id)}
                  open={timePopoverTaskId === row.entry.id}
                  onOpenChange={(open) =>
                    onTimePopoverOpenChange(row.entry.id, open)
                  }
                />
              ) : (
                <FixedBlockRow key={row.block.id} block={row.block} />
              ),
            )}
          </div>
        )}

        {deadlines.length > 0 && (
          <div className="space-y-1 p-1">
            <div className="flex items-center gap-1 px-1 text-meta text-muted-foreground">
              <Flag className="size-3" />
            </div>
            {deadlines.map((task) => (
              <DeadlineRow
                key={task.id}
                task={task}
                onOpen={() => onOpen(task)}
              />
            ))}
          </div>
        )}

        <div
          ref={untimedDroppable.setNodeRef}
          className={cn(
            "min-h-16 space-y-1 rounded-md p-1",
            untimedDroppable.isOver && "bg-brand/10",
          )}
        >
          <SortableContext
            items={untimedEntries}
            strategy={verticalListSortingStrategy}
          >
            {untimedEntries.map((entry) => (
              <PlannerTaskCard
                key={entry.id}
                task={entry}
                onOpen={() => onOpen(entry)}
                onEstimateChange={(seconds) =>
                  onEstimateChange(entry.id, seconds)
                }
              />
            ))}
          </SortableContext>
          {ghosts.map((ghost) => (
            <div
              key={`${ghost.recurrenceId}-${ghost.plannedDate}`}
              className="cursor-default space-y-1 rounded-md border border-dashed border-border/70 bg-transparent p-1.5 text-left opacity-70"
            >
              <span className="truncate text-body">{ghost.title}</span>
            </div>
          ))}
          {untimedEntries.length === 0 && ghosts.length === 0 && (
            <p className="p-1.5 text-meta text-muted-foreground">
              {t("planner:noTasks")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function TimedEntryRow({
  entry,
  onOpen,
  onEstimateChange,
  onSaveTime,
  onRemoveTime,
  open,
  onOpenChange,
}: {
  entry: PlanEntry;
  onOpen: () => void;
  onEstimateChange: (seconds: number | null) => void;
  onSaveTime: (minute: number) => void;
  onRemoveTime: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const ProjectIcon =
    projectIcons[entry.projectIcon as keyof typeof projectIcons] ?? Layout;

  return (
    // biome-ignore lint/a11y/useSemanticElements: sostiene contenido de bloque; los controles de dentro ya son interactivos por su cuenta
    <div
      role="button"
      tabIndex={0}
      aria-label={entry.title}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      className="space-y-1 rounded-md border border-border/70 bg-background p-1.5 text-left outline-none transition-colors hover:border-brand/45 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-center gap-1.5">
        <TimePopover
          minute={entry.startMinute ?? 0}
          onSave={onSaveTime}
          onRemove={onRemoveTime}
          open={open}
          onOpenChange={onOpenChange}
        />
        <span className="shrink-0">{getPriorityIcon(entry.priority)}</span>
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-body",
            entry.isDone && "text-muted-foreground line-through",
          )}
        >
          {entry.title}
        </span>
      </div>
      <div className="flex items-center gap-1 text-meta text-muted-foreground">
        <ProjectIcon className="size-3 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{entry.projectName}</span>
        <InlineEstimate
          estimate={entry.estimate}
          loggedSeconds={entry.loggedSeconds}
          onSave={onEstimateChange}
        />
      </div>
    </div>
  );
}

function FixedBlockRow({ block }: { block: PlanFixedBlock }) {
  return (
    <div className="flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 p-1.5 text-left">
      <span className="shrink-0 rounded px-1 font-mono text-meta text-muted-foreground tabular-nums">
        {fromMinutes(block.startMinute)}
      </span>
      <span className="min-w-0 flex-1 truncate text-body">{block.title}</span>
    </div>
  );
}

function DeadlineRow({
  task,
  onOpen,
}: {
  task: PlanDeadline;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const ProjectIcon =
    projectIcons[task.projectIcon as keyof typeof projectIcons] ?? Layout;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full space-y-1 rounded-md border border-border/70 bg-background p-1.5 text-left transition-colors hover:border-brand/45"
    >
      <div className="flex items-center gap-1.5">
        <span className="shrink-0">{getPriorityIcon(task.priority)}</span>
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-body",
            task.isDone && "text-muted-foreground line-through",
          )}
        >
          {task.title}
        </span>
      </div>
      <div className="flex items-center gap-1 text-meta text-muted-foreground">
        <ProjectIcon className="size-3 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{task.projectName}</span>
        {task.plannedDate && (
          <span className="shrink-0 text-label">
            {t("planner:plannedElsewhere", {
              date: new Date(task.plannedDate).toLocaleDateString(undefined, {
                weekday: "short",
              }),
            })}
          </span>
        )}
      </div>
    </button>
  );
}
