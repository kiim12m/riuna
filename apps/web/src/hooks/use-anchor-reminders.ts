import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useToday } from "@/hooks/queries/today/use-today";
import {
  markFired,
  readFired,
  readSnoozes,
  showBrowserNotification,
  withSingleTab,
} from "@/lib/browser-notify";
import { fromMinutes } from "@/lib/minutes";
import { dueReminders } from "@/lib/reminders/due-reminders";
import { useBrowserNotifyStore } from "@/store/browser-notify";
import { useReminderStore } from "@/store/reminder";

/** Cada cuanto se mira el reloj. En segundo plano el navegador lo estira. */
const TICK_MS = 30 * 1000;

/**
 * Avisa a la hora anclada de cada tarea de hoy (ADR 055). Vive en
 * `WorkspaceRuntime`, asi que suena en cualquier pantalla, pero solo con una
 * pestaña abierta y los avisos activados en este navegador. Solo pide Hoy si
 * estan activados: sin ellos no hay nada que vigilar.
 */
export function useAnchorReminders(workspaceId: string) {
  const { t } = useTranslation();
  const enabled = useBrowserNotifyStore((state) => state.enabled);
  const { data } = useToday(enabled ? workspaceId : "");
  const openReminder = useReminderStore((state) => state.open);

  useEffect(() => {
    if (!enabled || !data) return;
    const planned = data.planned;

    const tick = () => {
      const due = dueReminders(planned, {
        now: Date.now(),
        fired: readFired(),
        snoozedUntil: readSnoozes(),
      });
      if (due.length === 0) return;

      void withSingleTab("riuna:reminders", () => {
        // Releida dentro del cerrojo: otra pestaña puede haber avisado ya.
        const fired = readFired();
        for (const reminder of due) {
          if (fired.has(reminder.key)) continue;
          markFired(reminder.key);
          const entry = planned.find((row) => row.id === reminder.entry.id);
          if (!entry) continue;
          showBrowserNotification({
            title: t("reminders:notification.title"),
            body: t("reminders:notification.body", {
              time: fromMinutes(entry.startMinute ?? 0),
              title: entry.title,
            }),
            tag: reminder.key,
            onClick: () => openReminder(entry),
          });
        }
      });
    };

    tick();
    const interval = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(interval);
  }, [enabled, data, openReminder, t]);
}
