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
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  CalendarCheck,
  ChevronRight,
  CircleCheck,
  Moon,
  Star,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PageHeading } from "@/components/common/page-heading";
import WorkspaceLayout from "@/components/common/workspace-layout";
import PageTitle from "@/components/page-title";
import { QuickAddInput } from "@/components/quick-add/quick-add-input";
import TaskDetailsSheet from "@/components/task/task-details-sheet";
import {
  rowPlanOf,
  TaskRowActions,
} from "@/components/task-actions/task-row-actions";
import { StopDialog } from "@/components/timer/stop-dialog";
import { TodayPeek } from "@/components/today/today-peek";
import { TodayTaskRow } from "@/components/today/today-task-row";
import { Button } from "@/components/ui/button";
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
import { usePlanBulk } from "@/hooks/mutations/planner/use-plan-bulk";
import { useCompleteTask } from "@/hooks/mutations/task/use-complete-task";
import { useTimerMutations } from "@/hooks/mutations/time-entry/use-timer-mutations";
import { useTodayEstimateMutation } from "@/hooks/mutations/today/use-today-estimate-mutation";
import { useTodayPlanMutations } from "@/hooks/mutations/today/use-today-plan-mutations";
import { useRunningTimer } from "@/hooks/queries/time-entry/use-running-timer";
import { useToday } from "@/hooks/queries/today/use-today";
import { useElapsed } from "@/hooks/use-elapsed";
import { useStopWithConfirm } from "@/hooks/use-stop-with-confirm";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
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

// El resumen fijo de la derecha pide su columna de ~240 px: por debajo de
// `lg` no cabe junto a la lista, y la tarea se abre en el panel deslizante.
const WIDE_QUERY = "(min-width: 64rem)";

function useIsWide() {
  const [isWide, setIsWide] = useState(
    () =>
      typeof window !== "undefined" && window.matchMedia(WIDE_QUERY).matches,
  );

  useEffect(() => {
    const mql = window.matchMedia(WIDE_QUERY);
    const onChange = () => setIsWide(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isWide;
}

/** El unico bloque de "Plan de hoy" que se arrastra para reordenar. */
function SortableTodayRow({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  );
}

function rowTask(task: TodayTask | TodayEntry | TodayUrgent, isDone: boolean) {
  return {
    id: task.id,
    number: task.number,
    title: task.title,
    projectId: task.projectId,
    estimate: task.estimate,
    isDone,
  };
}

/**
 * Hoy: la pantalla de entrada del espacio personal (ADR 046). Compone sobre
 * `GET /today`: el plan de hoy, lo de dias anteriores sin terminar, lo
 * vencido o que vence hoy sin planificar, y lo terminado hoy.
 */
function TodayComponent() {
  const { t, i18n } = useTranslation();
  const { workspaceId } = Route.useParams();
  const navigate = useNavigate();
  const { data, isPending } = useToday(workspaceId);
  const { data: runningData } = useRunningTimer(workspaceId);
  const { start, stop, isStopping } = useTimerMutations(workspaceId);
  const { setEstimate } = useTodayEstimateMutation(workspaceId);
  const { addToToday, reorderPlanned } = useTodayPlanMutations(
    workspaceId,
    data?.serverToday ?? "",
  );
  const completeTask = useCompleteTask(workspaceId);
  const planBulk = usePlanBulk(workspaceId);
  const { canCreateTasks } = useWorkspacePermission();

  const [openTask, setOpenTask] = useState<{
    taskId: string;
    projectId: string;
  } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const isWide = useIsWide();
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

  // Solo se arrastra lo que no es imprescindible: el orden de las
  // imprescindibles es su puesto (ADR 053). Van delante en lo que se manda,
  // que es tambien como las devuelve la API.
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || !data || active.id === over.id) return;

    const ids = restPlanned.map((entry) => entry.id);
    const from = ids.indexOf(active.id.toString());
    const to = ids.indexOf(over.id.toString());
    if (from === -1 || to === -1) return;

    reorderPlanned([
      ...keyPlanned.map((entry) => entry.id),
      ...arrayMove(ids, from, to),
    ]);
  }

  const previous = data?.previous ?? [];
  const planned = data?.planned ?? [];
  const keyPlanned = planned.filter((entry) => entry.keyRank !== null);
  const restPlanned = planned.filter((entry) => entry.keyRank === null);
  const urgent = data?.urgent ?? [];
  const done = data?.done ?? [];
  const isEmpty =
    !isPending &&
    previous.length === 0 &&
    planned.length === 0 &&
    urgent.length === 0 &&
    done.length === 0;

  // Sin nada elegido, el resumen enseña lo que tiene el cronometro en marcha
  // y, si no, lo primero del plan. Si lo elegido desaparece de las listas
  // -se termino, se replanifico-, cae solo a lo mismo.
  const listed = [...previous, ...planned, ...urgent, ...done];
  const peekTask =
    listed.find((task) => task.id === selectedId) ??
    listed.find((task) => task.id === running?.task.id) ??
    planned[0] ??
    previous[0] ??
    urgent[0] ??
    null;
  const peekId = isWide ? peekTask?.id : undefined;

  function renderPlannedRow(task: TodayEntry, index: number) {
    return (
      <TaskRowActions
        key={task.id}
        workspaceId={workspaceId}
        task={rowTask(task, false)}
        plan={rowPlanOf(task)}
      >
        {(menu) => (
          <TodayTaskRow
            shaded={index % 2 === 0}
            selected={task.id === peekId}
            id={task.id}
            title={task.title}
            priority={task.priority}
            isDone={false}
            projectName={task.projectName}
            projectIcon={task.projectIcon}
            estimate={task.estimate}
            startMinute={task.startMinute}
            loggedSeconds={task.loggedSeconds}
            keyRank={task.keyRank}
            running={running?.task.id === task.id}
            onToggleTimer={() => toggleTimer(task)}
            onOpen={() => selectTask(task)}
            onToggleDone={(done) => toggleDone(task.id, done)}
            onEstimateChange={(seconds) => setEstimate(task.id, seconds)}
            menu={menu}
          />
        )}
      </TaskRowActions>
    );
  }

  function openDetails(task: { id: string; projectId: string }) {
    setOpenTask({ taskId: task.id, projectId: task.projectId });
  }

  function selectTask(task: { id: string; projectId: string }) {
    if (isWide) {
      setSelectedId(task.id);
    } else {
      openDetails(task);
    }
  }

  return (
    <>
      <PageTitle title={t("today:pageTitle")} />
      <WorkspaceLayout title={t("today:pageTitle")}>
        <div className="space-y-4 p-4">
          <PageHeading
            title={t("today:pageTitle")}
            description={
              data &&
              !isEmpty &&
              t("today:status", {
                remaining: formatDuration(
                  data.totals.estimateRemaining,
                  i18n.language,
                ),
                worked: formatDuration(data.totals.workedToday, i18n.language),
              })
            }
            actions={
              // Los rituales solo se abren con un boton (ADR 054): ni avisos
              // ni banners. Cerrado, el boton lo dice y permite repasarlo.
              data && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant={data.dayClosed ? "ghost" : "outline"}
                    size="sm"
                    onClick={() =>
                      navigate({
                        to: "/dashboard/workspace/$workspaceId/rituals/close-day",
                        params: { workspaceId },
                      })
                    }
                  >
                    {data.dayClosed ? <CircleCheck /> : <Moon />}
                    {t(
                      data.dayClosed
                        ? "rituals:closeDay.closed"
                        : "rituals:closeDay.button",
                    )}
                  </Button>
                </div>
              )
            }
          />
          {/* Lo que se captura desde Hoy es para hoy, salvo que diga otro dia. */}
          {data && canCreateTasks() && (
            <QuickAddInput
              workspaceId={workspaceId}
              defaultPlannedDate={data.serverToday}
              className="max-w-2xl"
            />
          )}
          {isPending ? (
            <div className="space-y-2">
              {["a", "b", "c"].map((key) => (
                <Skeleton key={key} className="h-10 w-full rounded-md" />
              ))}
            </div>
          ) : isEmpty ? (
            <Empty className="min-h-[40vh]">
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
            <div className="flex items-start gap-4">
              <div className="min-w-0 flex-1 space-y-6">
                {previous.length > 0 && (
                  <Collapsible
                    open={!previousCollapsed}
                    onOpenChange={(open) => {
                      setPreviousCollapsed(!open);
                      writeCollapsed(PREVIOUS_COLLAPSED_KEY, !open);
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <CollapsibleTrigger className="flex items-center gap-1 text-section">
                        <ChevronRight
                          className={`h-3.5 w-3.5 transition-transform duration-200 ${
                            previousCollapsed ? "" : "rotate-90"
                          }`}
                        />
                        {t("today:previous.title", { count: previous.length })}
                      </CollapsibleTrigger>
                      {/* La deuda de la ADR 047: todo de una vez (ADR 053). */}
                      {previous.length > 1 && data && (
                        <Button
                          variant="ghost"
                          size="xs"
                          disabled={planBulk.isPending}
                          onClick={() =>
                            planBulk.mutate({
                              taskIds: previous.map((task) => task.id),
                              plannedDate: data.serverToday,
                            })
                          }
                        >
                          {t("today:previous.addAllToToday")}
                        </Button>
                      )}
                    </div>
                    <CollapsiblePanel>
                      <div className="mt-1 space-y-0.5">
                        {previous.map((task: TodayEntry, index) => (
                          <TaskRowActions
                            key={task.id}
                            workspaceId={workspaceId}
                            task={rowTask(task, false)}
                            plan={rowPlanOf(task)}
                          >
                            {(menu) => (
                              <TodayTaskRow
                                shaded={index % 2 === 0}
                                selected={task.id === peekId}
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
                                onOpen={() => selectTask(task)}
                                onToggleDone={(done) =>
                                  toggleDone(task.id, done)
                                }
                                onEstimateChange={(seconds) =>
                                  setEstimate(task.id, seconds)
                                }
                                action={{
                                  label: t("today:previous.addToToday"),
                                  onClick: () => addToToday(task.id),
                                }}
                                menu={menu}
                              />
                            )}
                          </TaskRowActions>
                        ))}
                      </div>
                    </CollapsiblePanel>
                  </Collapsible>
                )}

                <section>
                  <h2 className="mb-1 text-section">
                    {t("today:planned.title")}
                  </h2>
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
                      {keyPlanned.length > 0 && (
                        <div
                          className="mb-2 space-y-0.5"
                          data-testid="today-key-tasks"
                        >
                          <h3 className="flex items-center gap-1 px-2.5 text-meta text-muted-foreground">
                            <Star className="size-3 fill-current text-warning" />
                            {t("today:key.title", {
                              count: keyPlanned.length,
                            })}
                          </h3>
                          {keyPlanned.map((task: TodayEntry, index) =>
                            renderPlannedRow(task, index),
                          )}
                        </div>
                      )}
                      <SortableContext
                        items={restPlanned.map((task) => task.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="space-y-0.5">
                          {restPlanned.map((task: TodayEntry, index) => (
                            <SortableTodayRow key={task.id} id={task.id}>
                              {renderPlannedRow(task, index)}
                            </SortableTodayRow>
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  )}
                </section>

                {urgent.length > 0 && (
                  <section>
                    <h2 className="mb-1 text-section">
                      {t("today:urgent.title")}
                    </h2>
                    <div className="space-y-0.5">
                      {urgent.map((task: TodayUrgent, index) => (
                        <TaskRowActions
                          key={task.id}
                          workspaceId={workspaceId}
                          task={rowTask(task, false)}
                          plan={null}
                        >
                          {(menu) => (
                            <TodayTaskRow
                              shaded={index % 2 === 0}
                              selected={task.id === peekId}
                              id={task.id}
                              title={task.title}
                              priority={task.priority}
                              isDone={false}
                              projectName={task.projectName}
                              projectIcon={task.projectIcon}
                              estimate={task.estimate}
                              running={running?.task.id === task.id}
                              onToggleTimer={() => toggleTimer(task)}
                              onOpen={() => selectTask(task)}
                              onToggleDone={(done) => toggleDone(task.id, done)}
                              dueBadge={
                                task.dueWindow === "overdue"
                                  ? "overdue"
                                  : "today"
                              }
                              action={{
                                label: t("today:urgent.planToday"),
                                onClick: () => addToToday(task.id),
                              }}
                              menu={menu}
                            />
                          )}
                        </TaskRowActions>
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
                        {done.map((task: TodayTask, index) => (
                          <TaskRowActions
                            key={task.id}
                            workspaceId={workspaceId}
                            task={rowTask(task, true)}
                          >
                            {(menu) => (
                              <TodayTaskRow
                                shaded={index % 2 === 0}
                                selected={task.id === peekId}
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
                                onOpen={() => selectTask(task)}
                                onToggleDone={(done) =>
                                  toggleDone(task.id, done)
                                }
                                menu={menu}
                              />
                            )}
                          </TaskRowActions>
                        ))}
                      </div>
                    </CollapsiblePanel>
                  </Collapsible>
                )}
              </div>
              {isWide && peekTask && (
                <TodayPeek
                  task={peekTask}
                  runningSeconds={
                    running?.task.id === peekTask.id ? elapsed : 0
                  }
                  onOpenDetails={() => openDetails(peekTask)}
                />
              )}
            </div>
          )}
        </div>
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
