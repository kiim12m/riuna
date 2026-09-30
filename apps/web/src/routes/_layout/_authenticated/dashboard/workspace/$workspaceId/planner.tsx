import {
  closestCorners,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  type UniqueIdentifier,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarClock } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import WorkspaceLayout from "@/components/common/workspace-layout";
import PageTitle from "@/components/page-title";
import { PlannerDay } from "@/components/planner/planner-day";
import { PlannerTaskCard } from "@/components/planner/task-card";
import TaskDetailsSheet from "@/components/task/task-details-sheet";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  PlanDeadline,
  PlanEntry,
  PlanFixedBlock,
  PlanGhost,
  PlanTask,
} from "@/fetchers/planner";
import { usePlannerEstimateMutation } from "@/hooks/mutations/planner/use-planner-estimate-mutation";
import { usePlannerMutations } from "@/hooks/mutations/planner/use-planner-mutations";
import { usePlanner } from "@/hooks/queries/planner/use-planner";
import { useWorkSchedule } from "@/hooks/queries/work-schedule/use-work-schedule";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/duration";
import { formatDate } from "@/lib/format";

const WINDOW_DAYS = 15;
const UNPLANNED_ID = "unplanned";
const DEFAULT_WORK_START_MINUTE = 9 * 60;

/**
 * `yyyy-mm-dd`, no un instante: sirve igual como id de columna que como carga
 * util de la mutacion (`PUT /planner/:taskId`), que es justo lo que pide un
 * dia sin zona.
 */
function isoDay(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseIsoDay(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date: Date, days: number) {
  const shifted = new Date(date);
  shifted.setDate(shifted.getDate() + days);
  return shifted;
}

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/planner",
)({
  component: RouteComponent,
});

/**
 * El Planificador: ventana rodante de 15 dias, en tres secciones por dia
 * (sin hora, con hora, vence este dia -ADR 045, `planner-day.component.html`
 * de super-productivity-), mas una columna de atrasadas de la que solo se
 * puede arrastrar. Arrastrar entre columnas escribe `personal_plan_entry`,
 * nunca `task.due_date` (ADR 040). Columnas discretas -no una linea de
 * tiempo continua-, asi que el arrastre es `dnd-kit` (como `kanban-board`),
 * no la matematica de puntero del Gantt.
 */
function RouteComponent() {
  const { t, i18n } = useTranslation();
  const { workspaceId } = Route.useParams();
  const { data, isPending } = usePlanner(workspaceId, WINDOW_DAYS);
  const { data: workSchedule } = useWorkSchedule();
  const { moveTask, reorderDay } = usePlannerMutations(
    workspaceId,
    WINDOW_DAYS,
  );
  const { setEstimate } = usePlannerEstimateMutation(workspaceId, WINDOW_DAYS);

  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  const [timePopoverTaskId, setTimePopoverTaskId] = useState<string | null>(
    null,
  );
  const [openTask, setOpenTask] = useState<{
    taskId: string;
    projectId: string;
  } | null>(null);

  // El dia del servidor y no `new Date()`: es la unica via que le quedaba a
  // la columna "Hoy" para apuntar a un dia distinto del que usa la API para
  // decidir que fantasmas y ventanas de vencimiento tocan hoy.
  const days = useMemo(() => {
    const today = data?.serverToday
      ? parseIsoDay(data.serverToday)
      : (() => {
          const now = new Date();
          now.setHours(0, 0, 0, 0);
          return now;
        })();
    return Array.from({ length: WINDOW_DAYS }, (_, i) => addDays(today, i));
  }, [data?.serverToday]);

  const entriesByDay = useMemo(() => {
    const map = new Map<string, PlanEntry[]>();
    for (const entry of data?.entries ?? []) {
      const key = isoDay(new Date(entry.plannedDate));
      const list = map.get(key) ?? [];
      list.push(entry);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.position - b.position);
    }
    return map;
  }, [data]);

  const ghostsByDay = useMemo(() => {
    const map = new Map<string, PlanGhost[]>();
    for (const ghost of data?.ghosts ?? []) {
      const key = isoDay(new Date(ghost.plannedDate));
      const list = map.get(key) ?? [];
      list.push(ghost);
      map.set(key, list);
    }
    return map;
  }, [data]);

  const deadlinesByDay = useMemo(() => {
    const map = new Map<string, PlanDeadline[]>();
    for (const deadline of data?.deadlines ?? []) {
      if (!deadline.dueDate) continue;
      const key = isoDay(new Date(deadline.dueDate));
      const list = map.get(key) ?? [];
      list.push(deadline);
      map.set(key, list);
    }
    return map;
  }, [data]);

  const fixedBlocksByDay: Record<string, PlanFixedBlock[]> =
    data?.fixedBlocksByDay ?? {};

  const allTasks = useMemo(
    () => [
      ...(data?.entries ?? []),
      ...(data?.previous ?? []),
      ...(data?.unplanned ?? []),
    ],
    [data],
  );
  const activeTask = allTasks.find((task) => task.id === activeId);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 10 },
    }),
    useSensor(KeyboardSensor),
  );

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    const taskId = active.id.toString();
    const overId = over.id.toString();

    const isUnplanned =
      overId === UNPLANNED_ID ||
      (data?.unplanned.some((task) => task.id === overId) ?? false);
    if (isUnplanned) {
      moveTask(taskId, null);
      return;
    }

    let destDayKey: string | null = null;
    let destZone: "untimed" | "timed" | null = null;

    const [maybeDay, maybeZone] = overId.split(":");
    if (maybeZone === "untimed" || maybeZone === "timed") {
      destDayKey = maybeDay;
      destZone = maybeZone;
    } else {
      // Se solto sobre una tarjeta: su dia y su seccion son los de destino.
      for (const [day, entries] of entriesByDay) {
        const found = entries.find((entry) => entry.id === overId);
        if (found) {
          destDayKey = day;
          destZone = found.startMinute == null ? "untimed" : "timed";
          break;
        }
      }
    }
    if (!destDayKey || !destZone) return;

    if (destZone === "timed") {
      const existing = entriesByDay
        .get(destDayKey)
        ?.find((entry) => entry.id === taskId);
      const minute =
        existing?.startMinute ??
        workSchedule?.workStartMinute ??
        DEFAULT_WORK_START_MINUTE;
      moveTask(taskId, { plannedDate: destDayKey, startMinute: minute });
      setTimePopoverTaskId(taskId);
      return;
    }

    const untimedIds = (entriesByDay.get(destDayKey) ?? [])
      .filter((entry) => entry.startMinute == null)
      .map((entry) => entry.id);
    const wasAlreadyUntimedHere = untimedIds.includes(taskId);
    const withoutDragged = untimedIds.filter((id) => id !== taskId);
    const overIndex = withoutDragged.indexOf(overId);
    const insertAt = overIndex === -1 ? withoutDragged.length : overIndex;
    const nextIds = [
      ...withoutDragged.slice(0, insertAt),
      taskId,
      ...withoutDragged.slice(insertAt),
    ];

    if (wasAlreadyUntimedHere) {
      reorderDay(destDayKey, nextIds);
    } else {
      moveTask(taskId, {
        plannedDate: destDayKey,
        startMinute: null,
        position: insertAt,
      });
    }
  }

  function findDayKeyForTask(taskId: string): string | null {
    for (const [day, entries] of entriesByDay) {
      if (entries.some((entry) => entry.id === taskId)) return day;
    }
    return null;
  }

  function handleAnchor(taskId: string, minute: number) {
    const dayKey = findDayKeyForTask(taskId);
    if (!dayKey) return;
    moveTask(taskId, { plannedDate: dayKey, startMinute: minute });
  }

  function handleUnanchor(taskId: string) {
    const dayKey = findDayKeyForTask(taskId);
    if (!dayKey) return;
    moveTask(taskId, { plannedDate: dayKey, startMinute: null });
  }

  const isEmpty =
    !isPending &&
    (data?.entries.length ?? 0) === 0 &&
    (data?.previous.length ?? 0) === 0 &&
    (data?.unplanned.length ?? 0) === 0 &&
    (data?.ghosts.length ?? 0) === 0;

  return (
    <>
      <PageTitle title={t("planner:pageTitle")} />
      <WorkspaceLayout title={t("planner:pageTitle")}>
        {isPending ? (
          <div className="flex gap-3 p-4">
            {["a", "b", "c"].map((key) => (
              <Skeleton key={key} className="h-64 w-56 shrink-0 rounded-lg" />
            ))}
          </div>
        ) : isEmpty ? (
          <Empty className="min-h-[50vh]">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CalendarClock />
              </EmptyMedia>
              <EmptyTitle>{t("planner:empty.title")}</EmptyTitle>
              <EmptyDescription>
                {t("planner:empty.description")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="flex h-full min-h-0 gap-3 overflow-x-auto p-4">
              <PlannerColumn
                id={UNPLANNED_ID}
                title={t("planner:unplanned")}
                tasks={data?.unplanned ?? []}
                onOpen={(task) =>
                  setOpenTask({ taskId: task.id, projectId: task.projectId })
                }
                onEstimateChange={setEstimate}
              />

              {(data?.previous.length ?? 0) > 0 && (
                <PreviousColumn
                  tasks={data?.previous ?? []}
                  onOpen={(task) =>
                    setOpenTask({ taskId: task.id, projectId: task.projectId })
                  }
                  onEstimateChange={setEstimate}
                />
              )}

              {days.map((day, index) => {
                const key = isoDay(day);
                const dayEntries = entriesByDay.get(key) ?? [];
                const untimedEntries = dayEntries.filter(
                  (entry) => entry.startMinute == null,
                );
                const timedEntries = dayEntries.filter(
                  (entry) => entry.startMinute != null,
                );
                const fixedBlocks = fixedBlocksByDay[key] ?? [];
                const ghosts = ghostsByDay.get(key) ?? [];
                const deadlines = deadlinesByDay.get(key) ?? [];

                const loadSeconds =
                  dayEntries.reduce(
                    (total, entry) =>
                      total +
                      Math.max(0, (entry.estimate ?? 0) - entry.loggedSeconds),
                    0,
                  ) +
                  fixedBlocks.reduce(
                    (total, block) =>
                      total + (block.endMinute - block.startMinute) * 60,
                    0,
                  );
                const capacitySeconds = data?.capacityByDay?.[key] ?? 0;
                const loadPct =
                  capacitySeconds > 0
                    ? Math.round((loadSeconds / capacitySeconds) * 100)
                    : loadSeconds > 0
                      ? 100
                      : 0;

                return (
                  <PlannerDay
                    key={key}
                    dayKey={key}
                    label={
                      index === 0
                        ? `${t("planner:today")} · ${formatDate(day, { weekday: "short", day: "numeric" })}`
                        : formatDate(day, { weekday: "short", day: "numeric" })
                    }
                    loadPct={loadPct}
                    loadLabel={t("planner:dayLoad", {
                      planned: formatDuration(loadSeconds, i18n.language),
                      available: formatDuration(capacitySeconds, i18n.language),
                    })}
                    untimedEntries={untimedEntries}
                    timedEntries={timedEntries}
                    fixedBlocks={fixedBlocks}
                    ghosts={ghosts}
                    deadlines={deadlines}
                    onOpen={(task) =>
                      setOpenTask({
                        taskId: task.id,
                        projectId: task.projectId,
                      })
                    }
                    onEstimateChange={setEstimate}
                    onAnchor={handleAnchor}
                    onUnanchor={handleUnanchor}
                    timePopoverTaskId={timePopoverTaskId}
                    onTimePopoverOpenChange={(taskId, open) =>
                      setTimePopoverTaskId(open ? taskId : null)
                    }
                  />
                );
              })}
            </div>

            <DragOverlay>
              {activeTask && (
                <PlannerTaskCard task={activeTask} onOpen={() => {}} />
              )}
            </DragOverlay>
          </DndContext>
        )}
      </WorkspaceLayout>

      <TaskDetailsSheet
        taskId={openTask?.taskId}
        projectId={openTask?.projectId ?? ""}
        workspaceId={workspaceId}
        onClose={() => setOpenTask(null)}
      />
    </>
  );
}

function PlannerColumn({
  id,
  title,
  tasks,
  onOpen,
  onEstimateChange,
}: {
  id: string;
  title: string;
  tasks: PlanTask[];
  onOpen: (task: PlanTask) => void;
  onEstimateChange: (taskId: string, seconds: number | null) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      data-testid={`planner-column-${id}`}
      className={cn(
        "flex h-full w-56 shrink-0 flex-col rounded-lg border bg-sidebar/40",
        isOver ? "border-brand/50" : "border-border/60",
      )}
    >
      <div className="space-y-1 px-2 py-2">
        <div className="flex items-center justify-between">
          <h2 className="text-section">{title}</h2>
          <span className="text-meta text-muted-foreground">
            {tasks.length}
          </span>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-1.5 pb-2">
        <SortableContext items={tasks} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <PlannerTaskCard
              key={task.id}
              task={task}
              onOpen={() => onOpen(task)}
              onEstimateChange={(seconds) => onEstimateChange(task.id, seconds)}
            />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}

/**
 * "De dias anteriores" (super-productivity): solo se arrastra desde aqui, no
 * hacia aqui -no lleva `useDroppable`, asi que nada puede soltarse encima-.
 */
function PreviousColumn({
  tasks,
  onOpen,
  onEstimateChange,
}: {
  tasks: PlanEntry[];
  onOpen: (task: PlanEntry) => void;
  onEstimateChange: (taskId: string, seconds: number | null) => void;
}) {
  const { t } = useTranslation();

  return (
    <div
      data-testid="planner-column-previous"
      className="flex h-full w-56 shrink-0 flex-col rounded-lg border border-warning/40 bg-warning/5"
    >
      <div className="space-y-1 px-2 py-2">
        <div className="flex items-center justify-between">
          <h2 className="text-section">{t("planner:previous")}</h2>
          <span className="text-meta text-muted-foreground">
            {tasks.length}
          </span>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-1.5 pb-2">
        <SortableContext items={tasks} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <PlannerTaskCard
              key={task.id}
              task={task}
              onOpen={() => onOpen(task)}
              onEstimateChange={(seconds) => onEstimateChange(task.id, seconds)}
            />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}
