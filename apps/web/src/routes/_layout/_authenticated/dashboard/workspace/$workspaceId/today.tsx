import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarCheck, ChevronRight } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import WorkspaceLayout from "@/components/common/workspace-layout";
import PageTitle from "@/components/page-title";
import TaskDetailsSheet from "@/components/task/task-details-sheet";
import { StopDialog } from "@/components/timer/stop-dialog";
import { TodayTaskRow } from "@/components/today/today-task-row";
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import type { TodayEntry, TodayTask, TodayUrgent } from "@/fetchers/today";
import { useCompleteTask } from "@/hooks/mutations/task/use-complete-task";
import { useTimerMutations } from "@/hooks/mutations/time-entry/use-timer-mutations";
import { useTodayEstimateMutation } from "@/hooks/mutations/today/use-today-estimate-mutation";
import { useTodayPlanMutations } from "@/hooks/mutations/today/use-today-plan-mutations";
import { useRunningTimer } from "@/hooks/queries/time-entry/use-running-timer";
import { useToday } from "@/hooks/queries/today/use-today";
import { useElapsed } from "@/hooks/use-elapsed";
import { useStopWithConfirm } from "@/hooks/use-stop-with-confirm";
import { formatDuration } from "@/lib/duration";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/today",
)({
  component: TodayComponent,
});

const PREVIOUS_COLLAPSED_KEY = "riuna:today:previous-collapsed";
const DONE_COLLAPSED_KEY = "riuna:today:done-collapsed";

function readCollapsed(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  try {
    const stored = window.localStorage.getItem(key);
    return stored === null ? fallback : stored === "true";
  } catch {
    return fallback;
  }
}

function writeCollapsed(key: string, value: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // El plegado es una comodidad del navegador: si no se puede guardar, se
    // pierde el recuerdo y nada mas.
  }
}

/** El unico bloque de "Plan de hoy" que se arrastra para reordenar. */
function SortableTodayRow(props: React.ComponentProps<typeof TodayTaskRow>) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: props.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TodayTaskRow {...props} />
    </div>
  );
}

/**
 * Hoy: la pantalla de entrada del espacio personal (ADR 046). Compone sobre
 * `GET /today`: el plan de hoy, lo de dias anteriores sin terminar, lo
 * vencido o que vence hoy sin planificar, y lo terminado hoy.
 */
function TodayComponent() {
  const { t, i18n } = useTranslation();
  const { workspaceId } = Route.useParams();
  const { data, isPending } = useToday(workspaceId);
  const { data: runningData } = useRunningTimer(workspaceId);
  const { start, stop, isStopping } = useTimerMutations(workspaceId);
  const { setEstimate } = useTodayEstimateMutation(workspaceId);
  const { addToToday, reorderPlanned } = useTodayPlanMutations(
    workspaceId,
    data?.serverToday ?? "",
  );
  const completeTask = useCompleteTask(workspaceId);

  const [openTask, setOpenTask] = useState<{
    taskId: string;
    projectId: string;
  } | null>(null);
  const [previousCollapsed, setPreviousCollapsed] = useState(() =>
    readCollapsed(PREVIOUS_COLLAPSED_KEY, false),
  );
  const [doneCollapsed, setDoneCollapsed] = useState(() =>
    readCollapsed(DONE_COLLAPSED_KEY, true),
  );

  const running = runningData?.running;
  const elapsed = useElapsed(running?.startTime);
  const { requestStop, dialogOpen, closeDialog, confirmStop } =
    useStopWithConfirm(stop, elapsed);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 10 },
    }),
    useSensor(KeyboardSensor),
  );

  function toggleTimer(task: {
    id: string;
    number: number | null;
    title: string;
    projectId: string;
    estimate: number | null;
  }) {
    if (running?.task.id === task.id) {
      requestStop();
    } else {
      start(task);
    }
  }

  function toggleDone(taskId: string, done: boolean) {
    completeTask.mutate({ taskId, done });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || !data || active.id === over.id) return;

    const ids = data.planned.map((entry) => entry.id);
    const from = ids.indexOf(active.id.toString());
    const to = ids.indexOf(over.id.toString());
    if (from === -1 || to === -1) return;

    reorderPlanned(arrayMove(ids, from, to));
  }

  const previous = data?.previous ?? [];
  const planned = data?.planned ?? [];
  const urgent = data?.urgent ?? [];
  const done = data?.done ?? [];
  const isEmpty =
    !isPending &&
    previous.length === 0 &&
    planned.length === 0 &&
    urgent.length === 0 &&
    done.length === 0;

  function openDetails(task: { id: string; projectId: string }) {
    setOpenTask({ taskId: task.id, projectId: task.projectId });
  }

  return (
    <>
      <PageTitle title={t("today:pageTitle")} />
      <WorkspaceLayout title={t("today:pageTitle")}>
        {isPending ? (
          <div className="space-y-2 p-4">
            {["a", "b", "c"].map((key) => (
              <Skeleton key={key} className="h-10 w-full rounded-md" />
            ))}
          </div>
        ) : isEmpty ? (
          <Empty className="min-h-[50vh]">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CalendarCheck />
              </EmptyMedia>
              <EmptyTitle>{t("today:empty.title")}</EmptyTitle>
              <EmptyDescription>
                {t("today:empty.description")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="space-y-6 p-4">
            {data && (
              <div className="text-body text-muted-foreground">
                {t("today:status", {
                  remaining: formatDuration(
                    data.totals.estimateRemaining,
                    i18n.language,
                  ),
                  worked: formatDuration(
                    data.totals.workedToday,
                    i18n.language,
                  ),
                })}
              </div>
            )}

            {previous.length > 0 && (
              <Collapsible
                open={!previousCollapsed}
                onOpenChange={(open) => {
                  setPreviousCollapsed(!open);
                  writeCollapsed(PREVIOUS_COLLAPSED_KEY, !open);
                }}
              >
                <CollapsibleTrigger className="flex items-center gap-1 text-section">
                  <ChevronRight
                    className={`h-3.5 w-3.5 transition-transform duration-200 ${
                      previousCollapsed ? "" : "rotate-90"
                    }`}
                  />
                  {t("today:previous.title", { count: previous.length })}
                </CollapsibleTrigger>
                <CollapsiblePanel>
                  <div className="mt-1 space-y-0.5">
                    {previous.map((task: TodayEntry) => (
                      <TodayTaskRow
                        key={task.id}
                        id={task.id}
                        title={task.title}
                        priority={task.priority}
                        isDone={false}
                        projectName={task.projectName}
                        projectIcon={task.projectIcon}
                        estimate={task.estimate}
                        loggedSeconds={task.loggedSeconds}
                        running={running?.task.id === task.id}
                        onToggleTimer={() => toggleTimer(task)}
                        onOpen={() => openDetails(task)}
                        onToggleDone={(done) => toggleDone(task.id, done)}
                        onEstimateChange={(seconds) =>
                          setEstimate(task.id, seconds)
                        }
                        action={{
                          label: t("today:previous.addToToday"),
                          onClick: () => addToToday(task.id),
                        }}
                      />
                    ))}
                  </div>
                </CollapsiblePanel>
              </Collapsible>
            )}

            <section>
              <h2 className="mb-1 text-section">{t("today:planned.title")}</h2>
              {planned.length === 0 ? (
                <p className="text-meta text-muted-foreground">
                  {t("today:planned.empty")}
                </p>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={planned.map((task) => task.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-0.5">
                      {planned.map((task: TodayEntry) => (
                        <SortableTodayRow
                          key={task.id}
                          id={task.id}
                          title={task.title}
                          priority={task.priority}
                          isDone={false}
                          projectName={task.projectName}
                          projectIcon={task.projectIcon}
                          estimate={task.estimate}
                          startMinute={task.startMinute}
                          loggedSeconds={task.loggedSeconds}
                          running={running?.task.id === task.id}
                          onToggleTimer={() => toggleTimer(task)}
                          onOpen={() => openDetails(task)}
                          onToggleDone={(done) => toggleDone(task.id, done)}
                          onEstimateChange={(seconds) =>
                            setEstimate(task.id, seconds)
                          }
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </section>

            {urgent.length > 0 && (
              <section>
                <h2 className="mb-1 text-section">{t("today:urgent.title")}</h2>
                <div className="space-y-0.5">
                  {urgent.map((task: TodayUrgent) => (
                    <TodayTaskRow
                      key={task.id}
                      id={task.id}
                      title={task.title}
                      priority={task.priority}
                      isDone={false}
                      projectName={task.projectName}
                      projectIcon={task.projectIcon}
                      estimate={task.estimate}
                      running={running?.task.id === task.id}
                      onToggleTimer={() => toggleTimer(task)}
                      onOpen={() => openDetails(task)}
                      onToggleDone={(done) => toggleDone(task.id, done)}
                      dueBadge={
                        task.dueDate && task.dueDate < `${data?.serverToday}`
                          ? "overdue"
                          : "today"
                      }
                      action={{
                        label: t("today:urgent.planToday"),
                        onClick: () => addToToday(task.id),
                      }}
                    />
                  ))}
                </div>
              </section>
            )}

            {done.length > 0 && (
              <Collapsible
                open={!doneCollapsed}
                onOpenChange={(open) => {
                  setDoneCollapsed(!open);
                  writeCollapsed(DONE_COLLAPSED_KEY, !open);
                }}
              >
                <CollapsibleTrigger className="flex items-center gap-1 text-section">
                  <ChevronRight
                    className={`h-3.5 w-3.5 transition-transform duration-200 ${
                      doneCollapsed ? "" : "rotate-90"
                    }`}
                  />
                  {t("today:done.title", { count: done.length })}
                </CollapsibleTrigger>
                <CollapsiblePanel>
                  <div className="mt-1 space-y-0.5">
                    {done.map((task: TodayTask) => (
                      <TodayTaskRow
                        key={task.id}
                        id={task.id}
                        title={task.title}
                        priority={task.priority}
                        isDone={true}
                        projectName={task.projectName}
                        projectIcon={task.projectIcon}
                        estimate={task.estimate}
                        loggedSeconds={task.loggedSeconds}
                        running={false}
                        onToggleTimer={() => {}}
                        onOpen={() => openDetails(task)}
                        onToggleDone={(done) => toggleDone(task.id, done)}
                      />
                    ))}
                  </div>
                </CollapsiblePanel>
              </Collapsible>
            )}
          </div>
        )}
      </WorkspaceLayout>

      <TaskDetailsSheet
        taskId={openTask?.taskId}
        projectId={openTask?.projectId ?? ""}
        workspaceId={workspaceId}
        onClose={() => setOpenTask(null)}
      />

      <StopDialog
        open={dialogOpen}
        onClose={closeDialog}
        onConfirm={confirmStop}
        isPending={isStopping}
      />
    </>
  );
}
