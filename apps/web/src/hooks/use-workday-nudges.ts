import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useRunningTimer } from "@/hooks/queries/time-entry/use-running-timer";
import { useToday } from "@/hooks/queries/today/use-today";
import { useWorkSchedule } from "@/hooks/queries/work-schedule/use-work-schedule";
import {
  markFired,
  readFiredTimes,
  showBrowserNotification,
  withSingleTab,
} from "@/lib/browser-notify";
import { formatDuration } from "@/lib/duration";
import { type Nudge, workdayNudges } from "@/lib/reminders/workday-nudges";
import { useBrowserNotifyStore } from "@/store/browser-notify";
import { useFocusStore } from "@/store/focus";

/** Las reglas van por minutos: mirar cada minuto basta. */
const TICK_MS = 60 * 1000;

/**
 * Los avisos de ritmo (ADR 056) -descanso, sin registrar, fuera de jornada-
 * con la misma via que los de la hora anclada (ADR 055): una sola pestaña,
 * sin repetir lo avisado, y solo si este navegador los quiere. Sin ninguno
 * activado no pide ni la jornada.
 */
export function useWorkdayNudges(workspaceId: string) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const enabled = useBrowserNotifyStore((state) => state.enabled);
  const preferences = useBrowserNotifyStore((state) => state.nudges);
  const active =
    enabled && (preferences.break || preferences.idle || preferences.overtime);
  const { data: schedule } = useWorkSchedule({ enabled: active });
  const { data: timer } = useRunningTimer(workspaceId);
  // Hoy dice si el dia es festivo o hay una ausencia (ADR 060). La misma
  // consulta que ya leen los avisos de la hora anclada.
  const { data: today } = useToday(active ? workspaceId : "");
  const dayOff = Boolean(today?.unavailable);
  const focusMode = useFocusStore((state) => state.session?.mode ?? null);
  const focusPhase = useFocusStore((state) => state.session?.phase ?? null);

  useEffect(() => {
    if (!active || !schedule || !timer) return;
    const running = timer.running
      ? {
          startTime: new Date(timer.running.startTime).getTime(),
          workingSince: new Date(timer.running.workingSince).getTime(),
        }
      : null;
    const lastStoppedAt = timer.lastStoppedAt
      ? new Date(timer.lastStoppedAt).getTime()
      : null;
    const taskTitle = timer.running?.task?.title ?? t("timer:untitledTask");

    const goToToday = () =>
      navigate({
        to: "/dashboard/workspace/$workspaceId/today",
        params: { workspaceId },
      });

    const announce = (nudge: Nudge) => {
      const text =
        nudge.kind === "break"
          ? {
              title: t("reminders:nudge.breakTitle", {
                duration: formatDuration(
                  Math.floor(nudge.workedMs / 1000),
                  i18n.language,
                ),
              }),
              body: t("reminders:nudge.breakBody"),
            }
          : nudge.kind === "idle"
            ? {
                title: t("reminders:nudge.idleTitle"),
                body: t("reminders:nudge.idleBody"),
              }
            : {
                title: t("reminders:nudge.overtimeTitle"),
                body: t("reminders:nudge.overtimeBody", { title: taskTitle }),
              };
      showBrowserNotification({
        ...text,
        tag: nudge.key,
        onClick: nudge.kind === "break" ? () => {} : goToToday,
      });
    };

    const tick = () => {
      const now = Date.now();
      const due = workdayNudges({
        now,
        schedule,
        running,
        lastStoppedAt,
        focus:
          focusMode && focusPhase
            ? { mode: focusMode, phase: focusPhase }
            : null,
        dayOff,
        preferences,
        fired: readFiredTimes(now),
      });
      if (due.length === 0) return;

      void withSingleTab("riuna:nudges", () => {
        // Releida dentro del cerrojo: otra pestaña puede haber avisado ya.
        const fired = readFiredTimes();
        for (const nudge of due) {
          if (nudge.key in fired) continue;
          markFired(nudge.key);
          announce(nudge);
        }
      });
    };

    tick();
    const interval = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(interval);
  }, [
    active,
    schedule,
    timer,
    focusMode,
    focusPhase,
    dayOff,
    preferences,
    navigate,
    t,
    i18n.language,
    workspaceId,
  ]);
}
