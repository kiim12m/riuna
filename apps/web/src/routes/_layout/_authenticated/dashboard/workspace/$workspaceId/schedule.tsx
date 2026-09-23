import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import WorkspaceLayout from "@/components/common/workspace-layout";
import PageTitle from "@/components/page-title";
import { CreateBlockDialog } from "@/components/schedule/create-block-dialog";
import { MonthView } from "@/components/schedule/month-view";
import {
  dayKey,
  headerTitle,
  parseDayKey,
  rangeFor,
  type ScheduleView,
  shiftAnchor,
} from "@/components/schedule/schedule-range";
import { ScheduleToolbar } from "@/components/schedule/schedule-toolbar";
import { type EditableBlock, TimeGrid } from "@/components/schedule/time-grid";
import TaskDetailsSheet from "@/components/task/task-details-sheet";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { ScheduleDay, ScheduleSegment } from "@/fetchers/schedule";
import { useScheduleMutations } from "@/hooks/mutations/schedule/use-schedule-mutations";
import { useSchedule } from "@/hooks/queries/schedule/use-schedule";
import { useUserPreferencesStore } from "@/store/user-preferences";

type ScheduleSearchParams = {
  view?: ScheduleView;
  /** `yyyy-mm-dd`: el ancla que `schedule-range.ts` expande a un rango. */
  date?: string;
};

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/schedule",
)({
  component: RouteComponent,
  validateSearch: (search: Record<string, unknown>): ScheduleSearchParams => ({
    view:
      search.view === "day" || search.view === "week" || search.view === "month"
        ? search.view
        : undefined,
    date: typeof search.date === "string" ? search.date : undefined,
  }),
});

/**
 * El Cronograma (ADR 041, actualizacion 2026-09-23): calendario de
 * verdad -Dia/Semana/Mes, navegable, con la rejilla siempre visible aunque el
 * dia este vacio- en vez de la ventana fija de 7 dias original. La vista y el
 * ancla viven en la URL para que compartir el enlace conserve lo que se
 * estaba mirando.
 */
function RouteComponent() {
  const { t } = useTranslation();
  const { workspaceId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const weekStartsOn = useUserPreferencesStore((state) => state.weekStartsOn);

  const view: ScheduleView = search.view ?? "week";
  const anchor = search.date ? parseDayKey(search.date) : new Date();
  const anchorKey = dayKey(anchor);

  // Sin useMemo: `rangeFor` es aritmetica de fechas pura y barata, no hace
  // falta memorizarla para que valga la pena evitar el nuevo Date() de cada
  // render.
  const range = rangeFor(view, anchor, weekStartsOn);

  const { data, isPending } = useSchedule(
    workspaceId,
    range.days,
    dayKey(range.from),
  );
  const mutations = useScheduleMutations(workspaceId);

  const [openTask, setOpenTask] = useState<{
    taskId: string;
    projectId: string;
  } | null>(null);
  const [blockDialogDay, setBlockDialogDay] = useState<string | null>(null);
  const [editingBlock, setEditingBlock] = useState<EditableBlock | null>(null);
  const [deletingBlockId, setDeletingBlockId] = useState<string | null>(null);

  const workStartMinute = data?.workStartMinute ?? 8 * 60;
  const workEndMinute = data?.workEndMinute ?? 18 * 60;

  const daysByKey = useMemo(() => {
    const map = new Map<string, ScheduleDay>();
    for (const day of data?.days ?? []) map.set(day.dayDate, day);
    return map;
  }, [data]);

  const goToView = (nextView: ScheduleView) => {
    navigate({ to: ".", search: (prev) => ({ ...prev, view: nextView }) });
  };
  const goToAnchor = (next: Date) => {
    navigate({
      to: ".",
      search: (prev) => ({ ...prev, date: dayKey(next) }),
      replace: true,
    });
  };
  const goToDay = (key: string) => {
    navigate({
      to: ".",
      search: (prev) => ({ ...prev, view: "day", date: key }),
    });
  };

  const title = headerTitle(view, anchor, weekStartsOn);
  const isViewingToday = anchorKey === dayKey(new Date());

  const handleOpen = (segment: ScheduleSegment) => {
    if (segment.type === "block" || !segment.task) return;
    setOpenTask({ taskId: segment.task.id, projectId: segment.task.projectId });
  };

  return (
    <>
      <PageTitle title={t("schedule:pageTitle")} />
      <WorkspaceLayout title={t("schedule:pageTitle")}>
        <div className="flex h-full flex-col">
          <ScheduleToolbar
            view={view}
            onViewChange={goToView}
            title={title}
            onPrevious={() => goToAnchor(shiftAnchor(view, anchor, -1))}
            onNext={() => goToAnchor(shiftAnchor(view, anchor, 1))}
            onToday={() => goToAnchor(new Date())}
            isViewingToday={isViewingToday}
            onAddBlock={() => setBlockDialogDay(anchorKey)}
          />

          {isPending ? (
            <div className="flex gap-3 p-4">
              {["a", "b", "c"].map((key) => (
                <Skeleton key={key} className="h-96 w-44 shrink-0 rounded-lg" />
              ))}
            </div>
          ) : view === "month" && range.weeks ? (
            <MonthView
              workspaceId={workspaceId}
              weeks={range.weeks}
              daysByKey={daysByKey}
              referenceMonth={anchor}
              weekStartsOn={weekStartsOn}
              onOpen={handleOpen}
              onSelectDay={goToDay}
            />
          ) : (
            <TimeGrid
              workspaceId={workspaceId}
              days={data?.days ?? []}
              isWide={view === "day"}
              workStartMinute={workStartMinute}
              workEndMinute={workEndMinute}
              onOpen={handleOpen}
              onMove={(taskId, minute) =>
                mutations.setEntryTime.mutate({ taskId, startMinute: minute })
              }
              onMoveDay={(taskId, projectId, dayKey, minute, durationMinutes) =>
                mutations.moveEntryDay.mutate({
                  taskId,
                  projectId,
                  dayKey,
                  startMinute: minute,
                  durationMinutes,
                })
              }
              onUnpin={(taskId) =>
                mutations.setEntryTime.mutate({ taskId, startMinute: null })
              }
              onResize={(event) => mutations.resizeEntry.mutate(event)}
              onAddBlock={setBlockDialogDay}
              onEditBlock={setEditingBlock}
            />
          )}
        </div>
      </WorkspaceLayout>

      <TaskDetailsSheet
        taskId={openTask?.taskId}
        projectId={openTask?.projectId ?? ""}
        workspaceId={workspaceId}
        onClose={() => setOpenTask(null)}
      />

      <CreateBlockDialog
        open={blockDialogDay !== null || editingBlock !== null}
        day={blockDialogDay ?? ""}
        editingBlock={editingBlock}
        onClose={() => {
          setBlockDialogDay(null);
          setEditingBlock(null);
        }}
        isPending={
          mutations.createBlock.isPending || mutations.updateBlock.isPending
        }
        onCreate={(input) => {
          mutations.createBlock.mutate(input);
          setBlockDialogDay(null);
        }}
        onUpdate={(id, input) => {
          mutations.updateBlock.mutate(
            { id, ...input },
            { onSuccess: () => setEditingBlock(null) },
          );
        }}
        onRequestDelete={setDeletingBlockId}
      />

      <AlertDialog
        open={deletingBlockId !== null}
        onOpenChange={(next) => !next && setDeletingBlockId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("schedule:createBlock.deleteTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("schedule:createBlock.deleteDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" size="sm" />}>
              {t("common:actions.cancel")}
            </AlertDialogClose>
            <AlertDialogClose
              render={
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    if (!deletingBlockId) return;
                    mutations.deleteBlock.mutate(deletingBlockId);
                    setDeletingBlockId(null);
                    setEditingBlock(null);
                  }}
                />
              }
            >
              {t("common:actions.delete")}
            </AlertDialogClose>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
