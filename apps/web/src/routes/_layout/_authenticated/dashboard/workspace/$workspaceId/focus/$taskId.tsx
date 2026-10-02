import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import PageTitle from "@/components/page-title";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { useTimerMutations } from "@/hooks/mutations/time-entry/use-timer-mutations";
import useGetTask from "@/hooks/queries/task/use-get-task";
import { cn } from "@/lib/cn";
import {
  elapsedMs,
  type FocusMode,
  finishWork,
  isBreak,
  nextWork,
  POMODORO,
  remainingMs,
  startFocus,
} from "@/lib/focus/machine";
import { formatElapsedClock } from "@/lib/format-clock";
import { useFocusStore } from "@/store/focus";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/focus/$taskId",
)({
  component: FocusRoute,
});

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [active]);
  return now;
}

/**
 * El modo foco a pantalla completa (ADR 056): sin barra lateral ni nada mas
 * que la tarea, la fase y su reloj. Salir no para nada: la sesion sigue y la
 * barra lateral la enseña; para eso esta «Parar».
 */
function FocusRoute() {
  const { t } = useTranslation();
  const { workspaceId, taskId } = Route.useParams();
  const navigate = useNavigate();
  const { data: task, isPending } = useGetTask(taskId);
  const session = useFocusStore((state) => state.session);
  const setSession = useFocusStore((state) => state.setSession);
  const clear = useFocusStore((state) => state.clear);
  const { start, stop } = useTimerMutations(workspaceId);
  const countdownId = useId();
  const [mode, setMode] = useState<FocusMode>("pomodoro");
  const [countdownMinutes, setCountdownMinutes] = useState("45");

  const mine = session?.taskId === taskId ? session : null;
  const now = useNow(Boolean(mine));

  const timerTask = task
    ? {
        id: task.id,
        number: task.number ?? null,
        title: task.title,
        projectId: task.projectId,
        estimate: task.estimate ?? null,
      }
    : null;

  const exit = () =>
    navigate({
      to: "/dashboard/workspace/$workspaceId/today",
      params: { workspaceId },
    });

  const begin = () => {
    if (!timerTask) return;
    const minutes = Number(countdownMinutes);
    setSession(
      startFocus({
        mode,
        taskId,
        now: Date.now(),
        countdownMs:
          mode === "countdown" && minutes > 0 ? minutes * 60 * 1000 : null,
      }),
    );
    start(timerTask, mode);
  };

  const workAgain = () => {
    if (!mine || !timerTask) return;
    setSession(nextWork(mine, Date.now()));
    start(timerTask, mine.mode);
  };

  const takeBreak = () => {
    if (!mine) return;
    setSession(finishWork(mine, Date.now()));
    stop();
  };

  const stopFocus = () => {
    if (mine?.phase === "work") stop();
    clear();
  };

  if (isPending || !task) {
    return (
      <div className="flex min-h-svh w-full flex-1 items-center justify-center bg-background p-4">
        <Skeleton className="h-48 w-full max-w-md" />
      </div>
    );
  }

  const remaining = mine ? remainingMs(mine, now) : null;
  const clock =
    mine === null
      ? formatElapsedClock(
          mode === "pomodoro"
            ? POMODORO.workMs / 1000
            : mode === "countdown"
              ? Math.max(0, Number(countdownMinutes) || 0) * 60
              : 0,
        )
      : formatElapsedClock(
          Math.round((remaining ?? elapsedMs(mine, now)) / 1000),
        );

  return (
    <>
      <PageTitle title={t("focus:pageTitle", { title: task.title })} />
      <div
        className="flex min-h-svh w-full flex-1 flex-col bg-background"
        data-testid="focus-screen"
      >
        <header className="flex items-center justify-between p-4">
          <Button variant="ghost" size="sm" onClick={exit}>
            <ArrowLeft />
            {t("focus:leave")}
          </Button>
          {mine && mine.mode === "pomodoro" && (
            <span className="text-meta text-muted-foreground">
              {t("focus:cycle", {
                current: (mine.completedWork % POMODORO.longEvery) + 1,
                total: POMODORO.longEvery,
              })}
            </span>
          )}
        </header>

        <main className="flex flex-1 flex-col items-center justify-center gap-6 p-4 text-center">
          <div className="space-y-1">
            <p
              className={cn(
                "text-label uppercase tracking-wide",
                mine && isBreak(mine.phase)
                  ? "text-success-foreground"
                  : "text-brand",
              )}
              data-testid="focus-phase"
            >
              {mine ? t(`focus:phase.${mine.phase}`) : t("focus:phase.idle")}
            </p>
            <h1 className="max-w-xl text-balance text-page">{task.title}</h1>
          </div>

          <p
            className="font-mono text-7xl tabular-nums tracking-tight"
            data-testid="focus-clock"
            aria-live="off"
          >
            {clock}
          </p>

          {mine === null && (
            <div className="flex flex-col items-center gap-3">
              <SegmentedControl
                label={t("focus:modeLabel")}
                value={mode}
                onValueChange={setMode}
                options={[
                  { value: "pomodoro", label: t("focus:mode.pomodoro") },
                  { value: "flowtime", label: t("focus:mode.flowtime") },
                  { value: "countdown", label: t("focus:mode.countdown") },
                ]}
              />
              <p className="max-w-sm text-meta text-muted-foreground">
                {t(`focus:modeHint.${mode}`)}
              </p>
              {mode === "countdown" && (
                <div className="flex items-center gap-2">
                  <Label htmlFor={countdownId}>{t("focus:minutes")}</Label>
                  <Input
                    id={countdownId}
                    type="number"
                    min={1}
                    max={240}
                    className="w-20"
                    value={countdownMinutes}
                    onChange={(event) =>
                      setCountdownMinutes(event.target.value)
                    }
                  />
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-center gap-2">
            {mine === null && (
              <Button size="lg" onClick={begin}>
                {t("focus:start")}
              </Button>
            )}
            {mine?.phase === "work" && (
              <Button size="lg" variant="outline" onClick={takeBreak}>
                {t(
                  mine.mode === "countdown"
                    ? "focus:finishNow"
                    : "focus:takeBreak",
                )}
              </Button>
            )}
            {mine && isBreak(mine.phase) && (
              <Button size="lg" variant="outline" onClick={workAgain}>
                {t("focus:skipBreak")}
              </Button>
            )}
            {(mine?.phase === "ready" || mine?.phase === "done") && (
              <Button size="lg" onClick={workAgain}>
                {t(mine.phase === "done" ? "focus:again" : "focus:nextBlock")}
              </Button>
            )}
            {mine && (
              <Button size="lg" variant="ghost" onClick={stopFocus}>
                {t("focus:stop")}
              </Button>
            )}
          </div>

          {session && !mine && (
            <p className="text-meta text-muted-foreground">
              {t("focus:otherTask")}
            </p>
          )}
        </main>
      </div>
    </>
  );
}
