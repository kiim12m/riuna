import { useDraggable, useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { AlarmClock, Flag } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  type DayOff,
  DayOffBadge,
} from "@/components/availability/day-off-badge";
import { DayLoadBar } from "@/components/planner/day-load-bar";
import { PlannerRow } from "@/components/planner/planner-row";
import { TimePopover } from "@/components/planner/time-popover";
import {
  rowPlanOf,
  TaskRowActions,
} from "@/components/task-actions/task-row-actions";
import { InlineEstimate } from "@/components/timer/inline-estimate";
import type {
  PlanDeadline,
  PlanEntry,
  PlanFixedBlock,
  PlanGhost,
} from "@/fetchers/planner";
import { cn } from "@/lib/cn";
import { fromMinutes } from "@/lib/minutes";
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
  loadHint,
  dayOff,
  untimedEntries,
  timedEntries,
  fixedBlocks,
  ghosts,
  deadlines,
  onOpen,
  onEstimateChange,
  onAnchor,
  onUnanchor,
  onToggleDone,
  timePopoverTaskId,
  onTimePopoverOpenChange,
}: {
  dayKey: string;
  label: string;
  loadPct: number;
  /** La carga en horas («3 h planificadas de 8 h»): va en el tooltip, el
   * porcentaje es lo que se lee de un vistazo. */
  loadHint: string;
  /** Festivo o ausencia (ADR 060): la capacidad ya es 0. */
  dayOff: DayOff | null;
  untimedEntries: PlanEntry[];
  timedEntries: PlanEntry[];
  fixedBlocks: PlanFixedBlock[];
  ghosts: PlanGhost[];
  deadlines: PlanDeadline[];
  onOpen: (task: { id: string; projectId: string }) => void;
  onEstimateChange: (taskId: string, seconds: number | null) => void;
  onAnchor: (taskId: string, minute: number) => void;
  onUnanchor: (taskId: string) => void;
  onToggleDone: (taskId: string, done: boolean) => void;
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
      <div className="space-y-1 px-2 py-2" title={loadHint}>
        <h2 className="font-semibold text-meta">{label}</h2>
        {dayOff && <DayOffBadge dayOff={dayOff} className="max-w-full" />}
        <p className="text-meta text-muted-foreground tabular-nums">
          {t("planner:dayLoadPct", { pct: loadPct })}
        </p>
        <DayLoadBar pct={loadPct} />
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-1.5 pb-2">
        {/* Siempre presente, aunque el dia no tenga nada con hora: antes solo
         * se pintaba con filas dentro, y en un dia vacio no habia donde
         * soltar una tarea para anclarla. Vacia, es una franja discreta. */}
        <div
          ref={timedDroppable.setNodeRef}
          data-testid={`planner-timed-${dayKey}`}
          className={cn(
            "space-y-1 rounded-md p-1",
            timedRows.length === 0 && "border border-dashed border-border/50",
            timedDroppable.isOver && "bg-brand/10",
          )}
        >
          <div className="flex items-center gap-1 px-1 text-meta text-muted-foreground">
            <AlarmClock className="size-3" />
            {timedRows.length === 0 && (
              <span className="opacity-70">{t("planner:dropToAnchor")}</span>
            )}
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
                onToggleDone={(done) => onToggleDone(row.entry.id, done)}
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
                onToggleDone={(done) => onToggleDone(entry.id, done)}
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

/**
 * Una tarea anclada. Se arrastra -a otro dia, que conserva su hora, o a "sin
 * hora", que la suelta-, pero no se reordena dentro de "Con hora": ahi el
 * orden lo da la hora. `useDraggable` y no `useSortable` por eso mismo; lo
 * que se mueve en pantalla es el `DragOverlay` del Planificador, y la fila de
 * origen solo se atenua.
 */
function TimedEntryRow({
  entry,
  onOpen,
  onEstimateChange,
  onSaveTime,
  onRemoveTime,
  onToggleDone,
  open,
  onOpenChange,
}: {
  entry: PlanEntry;
  onOpen: () => void;
  onEstimateChange: (seconds: number | null) => void;
  onSaveTime: (minute: number) => void;
  onRemoveTime: () => void;
  onToggleDone: (done: boolean) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: entry.id,
  });

  return (
    <div ref={setNodeRef} {...attributes} {...listeners}>
      <TaskRowActions
        task={{
          id: entry.id,
          number: entry.number,
          title: entry.title,
          projectId: entry.projectId,
          estimate: entry.estimate,
          isDone: entry.isDone,
        }}
        plan={rowPlanOf(entry)}
      >
        {(menu) => (
          <PlannerRow
            title={entry.title}
            priority={entry.priority}
            isDone={entry.isDone}
            projectName={entry.projectName}
            projectIcon={entry.projectIcon}
            onOpen={onOpen}
            timerTask={entry}
            onToggleDone={onToggleDone}
            keyRank={entry.keyRank}
            menu={menu}
            className={cn(
              "cursor-grab active:cursor-grabbing",
              isDragging && "opacity-40",
            )}
            leading={
              <TimePopover
                minute={entry.startMinute ?? 0}
                onSave={onSaveTime}
                onRemove={onRemoveTime}
                open={open}
                onOpenChange={onOpenChange}
              />
            }
            trailing={
              <InlineEstimate
                estimate={entry.estimate}
                loggedSeconds={entry.loggedSeconds}
                onSave={onEstimateChange}
              />
            }
          />
        )}
      </TaskRowActions>
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

  return (
    <PlannerRow
      title={task.title}
      priority={task.priority}
      isDone={task.isDone}
      projectName={task.projectName}
      projectIcon={task.projectIcon}
      onOpen={onOpen}
      trailing={
        task.plannedDate && (
          <span className="shrink-0 text-label">
            {t("planner:plannedElsewhere", {
              date: new Date(task.plannedDate).toLocaleDateString(undefined, {
                weekday: "short",
              }),
            })}
          </span>
        )
      }
    />
  );
}
