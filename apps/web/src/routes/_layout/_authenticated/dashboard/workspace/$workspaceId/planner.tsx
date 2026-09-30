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
import type { PlanEntry, PlanGhost, PlanTask } from "@/fetchers/planner";
import { usePlannerMutations } from "@/hooks/mutations/planner/use-planner-mutations";
import { usePlanner } from "@/hooks/queries/planner/use-planner";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";

const WINDOW_DAYS = 15;
const UNPLANNED_ID = "unplanned";

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
 * El Planificador: ventana rodante de 15 dias. Arrastrar entre columnas
 * escribe `personal_plan_entry`, nunca `task.due_date` (ADR 040). Columnas
 * discretas -no una linea de tiempo continua-, asi que el arrastre es
 * `dnd-kit` (como `kanban-board`), no la matematica de puntero del Gantt.
 */
function RouteComponent() {
  const { t } = useTranslation();
  const { workspaceId } = Route.useParams();
  const { data, isPending } = usePlanner(workspaceId, WINDOW_DAYS);
  const { moveTask } = usePlannerMutations(workspaceId, WINDOW_DAYS);

  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
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

  const allTasks = useMemo(
    () => [...(data?.entries ?? []), ...(data?.unplanned ?? [])],
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

  function resolveDestinationDay(overId: string): string | null {
    if (overId === UNPLANNED_ID) return null;
    if (days.some((day) => isoDay(day) === overId)) return overId;

    // Se solto sobre una tarjeta: su dia es el de la columna destino.
    for (const [day, entries] of entriesByDay) {
      if (entries.some((entry) => entry.id === overId)) return day;
    }
    return null;
  }

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

    const destinationDay = resolveDestinationDay(overId);
    if (!destinationDay) return;

    const siblings = entriesByDay.get(destinationDay) ?? [];
    const position = siblings.some((entry) => entry.id === taskId)
      ? siblings.findIndex((entry) => entry.id === taskId)
      : siblings.length;

    moveTask(taskId, { plannedDate: destinationDay, position });
  }

  const isEmpty =
    !isPending &&
    (data?.entries.length ?? 0) === 0 &&
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
              />
              {days.map((day, index) => {
                const key = isoDay(day);
                const entries = entriesByDay.get(key) ?? [];
                const ghosts = ghostsByDay.get(key) ?? [];
                const loadSeconds = entries.reduce(
                  (total, entry) => total + (entry.estimate ?? 0),
                  0,
                );
                // La capacidad es de este dia (ADR 045): un dia no laborable
                // vale 0, y no hay jornada de la que dividir.
                const dayCapacity = data?.capacityByDay?.[key] ?? 0;
                const loadPct =
                  dayCapacity > 0
                    ? Math.round((loadSeconds / dayCapacity) * 100)
                    : loadSeconds > 0
                      ? 100
                      : 0;

                return (
                  <PlannerColumn
                    key={key}
                    id={key}
                    title={
                      index === 0
                        ? `${t("planner:today")} · ${formatDate(day, { weekday: "short", day: "numeric" })}`
                        : formatDate(day, { weekday: "short", day: "numeric" })
                    }
                    tasks={entries}
                    ghosts={ghosts}
                    loadPct={loadPct}
                    onOpen={(task) =>
                      setOpenTask({
                        taskId: task.id,
                        projectId: task.projectId,
                      })
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
  ghosts = [],
  loadPct,
  onOpen,
}: {
  id: string;
  title: string;
  tasks: PlanTask[];
  ghosts?: PlanGhost[];
  loadPct?: number;
  onOpen: (task: PlanTask) => void;
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
        {loadPct !== undefined && (
          <div className="h-1 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full",
                loadPct > 100 ? "bg-warning-foreground" : "bg-brand",
              )}
              style={{ width: `${Math.min(loadPct, 100)}%` }}
            />
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-1.5 pb-2">
        <SortableContext items={tasks} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <PlannerTaskCard
              key={task.id}
              task={task}
              onOpen={() => onOpen(task)}
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
      </div>
    </div>
  );
}
