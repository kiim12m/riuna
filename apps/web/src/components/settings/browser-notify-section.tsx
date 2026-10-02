import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Switch } from "@/components/ui/switch";
import { notificationPermission } from "@/lib/browser-notify";
import type { NudgeKind } from "@/lib/reminders/workday-nudges";
import { useBrowserNotifyStore } from "@/store/browser-notify";

const NUDGE_KINDS: NudgeKind[] = ["break", "idle", "overtime"];

/**
 * Activar los avisos del navegador (ADR 055). Es una decision de este
 * navegador -el permiso lo da el navegador, no la cuenta-, y el texto dice
 * claro lo que no hacen: sin pestaña abierta, no hay aviso. Debajo, los
 * avisos de ritmo (ADR 056), uno a uno y apagados de serie.
 */
export function BrowserNotifySection() {
  const { t } = useTranslation();
  const enabled = useBrowserNotifyStore((state) => state.enabled);
  const enable = useBrowserNotifyStore((state) => state.enable);
  const disable = useBrowserNotifyStore((state) => state.disable);
  const nudges = useBrowserNotifyStore((state) => state.nudges);
  const setNudge = useBrowserNotifyStore((state) => state.setNudge);
  const [permission, setPermission] = useState(notificationPermission);

  const unsupported = permission === "unsupported";
  const denied = permission === "denied";

  return (
    <div className="space-y-6" data-testid="browser-notify-section">
      <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="space-y-1">
          <h2 className="text-md font-medium">
            {t("reminders:settings.title")}
          </h2>
          <p className="text-xs text-muted-foreground">
            {t("reminders:settings.subtitle")}
          </p>
        </div>
      </div>
      <div className="space-y-3 rounded-md border border-border bg-sidebar p-4">
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm">{t("reminders:settings.toggle")}</span>
          <Switch
            aria-label={t("reminders:settings.toggle")}
            checked={enabled}
            disabled={unsupported || denied}
            onCheckedChange={async (checked) => {
              if (checked) {
                setPermission(await enable());
              } else {
                disable();
              }
            }}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {unsupported
            ? t("reminders:settings.unsupported")
            : denied
              ? t("reminders:settings.denied")
              : t("reminders:settings.limits")}
        </p>
        <div className="space-y-3 border-border border-t pt-3">
          <div className="space-y-1">
            <h3 className="text-sm font-medium">
              {t("reminders:settings.nudgesTitle")}
            </h3>
            <p className="text-xs text-muted-foreground">
              {t(
                enabled
                  ? "reminders:settings.nudgesHint"
                  : "reminders:settings.nudgesNeedToggle",
              )}
            </p>
          </div>
          {NUDGE_KINDS.map((kind) => (
            <div key={kind} className="flex items-center justify-between gap-4">
              <span className="text-sm">
                {t(`reminders:settings.nudges.${kind}`)}
              </span>
              <Switch
                aria-label={t(`reminders:settings.nudges.${kind}`)}
                checked={nudges[kind]}
                disabled={!enabled}
                onCheckedChange={(checked) => setNudge(kind, checked)}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
