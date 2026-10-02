import { useTranslation } from "react-i18next";
import { parseDayKey } from "@/components/schedule/schedule-range";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTaskPlanMutations } from "@/hooks/mutations/planner/use-task-plan-mutations";
import { useTimerMutations } from "@/hooks/mutations/time-entry/use-timer-mutations";
import { useWorkSchedule } from "@/hooks/queries/work-schedule/use-work-schedule";
import { snoozeUntil } from "@/lib/browser-notify";
import { formatDate } from "@/lib/format";
import { fromMinutes } from "@/lib/minutes";
import { nextWorkDayKey } from "@/lib/work-days";
import { useReminderStore } from "@/store/reminder";

const SNOOZE_MS = 10 * 60 * 1000;
const DEFAULT_WORK_DAYS = 0b0_111_110;

function todayKey() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Lo que se decide al pulsar un aviso (ADR 055): sin service worker la
 * notificacion no lleva botones, asi que llegan aqui. Empezar arranca el
 * cronometro; posponer vuelve a avisar en diez minutos, en este navegador;
 * «al siguiente dia» la pasa al proximo laborable conservando la hora.
 */
export function ReminderDialog({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation();
  const entry = useReminderStore((state) => state.entry);
  const close = useReminderStore((state) => state.close);
  const { start } = useTimerMutations(workspaceId);
  const { plan } = useTaskPlanMutations(workspaceId, entry?.id ?? "");
  const { data: schedule } = useWorkSchedule();

  const nextDay = nextWorkDayKey(
    todayKey(),
    schedule?.workDays ?? DEFAULT_WORK_DAYS,
  );

  return (
    <Dialog open={entry !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-md">
        {entry && (
          <>
            <DialogHeader>
              <DialogTitle>{entry.title}</DialogTitle>
              <DialogDescription>
                {t("reminders:dialog.description", {
                  time: fromMinutes(entry.startMinute ?? 0),
                })}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  plan(nextDay);
                  close();
                }}
              >
                {t("reminders:dialog.nextDay", {
                  day: formatDate(parseDayKey(nextDay), {
                    weekday: "short",
                    day: "numeric",
                  }),
                })}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  snoozeUntil(entry.id, Date.now() + SNOOZE_MS);
                  close();
                }}
              >
                {t("reminders:dialog.snooze")}
              </Button>
              <Button
                onClick={() => {
                  start({
                    id: entry.id,
                    number: entry.number,
                    title: entry.title,
                    projectId: entry.projectId,
                    estimate: entry.estimate,
                  });
                  close();
                }}
              >
                {t("reminders:dialog.start")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
