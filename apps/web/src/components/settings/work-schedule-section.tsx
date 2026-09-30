import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { useUpdateWorkSchedule } from "@/hooks/mutations/work-schedule/use-update-work-schedule";
import { useWorkSchedule } from "@/hooks/queries/work-schedule/use-work-schedule";
import { cn } from "@/lib/cn";
import { fromMinutes, toMinutes } from "@/lib/minutes";
import { toast } from "@/lib/toast";
import { WEEKDAYS_MONDAY_FIRST, weekdayLabel } from "@/lib/weekdays";

function bitmaskToDays(mask: number): Set<number> {
  const days = new Set<number>();
  for (let day = 0; day < 7; day++) {
    if ((mask >> day) & 1) days.add(day);
  }
  return days;
}

function daysToBitmask(days: Set<number>): number {
  let mask = 0;
  for (const day of days) mask |= 1 << day;
  return mask;
}

/**
 * La jornada personal (ADR 045): fuente unica de horario y capacidad para el
 * Planificador, el Cronograma y Hoy. Sin fila guardada, la API ya devuelve
 * los valores por defecto -09:00 a 17:00, sin comida, lunes a viernes-, asi
 * que esta seccion siempre tiene algo que mostrar.
 */
export function WorkScheduleSection() {
  const { t } = useTranslation();
  const { data } = useWorkSchedule();
  const { mutate, isPending } = useUpdateWorkSchedule();

  const [workStart, setWorkStart] = useState("09:00");
  const [workEnd, setWorkEnd] = useState("17:00");
  const [lunchEnabled, setLunchEnabled] = useState(false);
  const [lunchStart, setLunchStart] = useState("13:00");
  const [lunchEnd, setLunchEnd] = useState("14:00");
  const [workDays, setWorkDays] = useState<Set<number>>(
    () => new Set([1, 2, 3, 4, 5]),
  );

  useEffect(() => {
    if (!data) return;
    setWorkStart(fromMinutes(data.workStartMinute));
    setWorkEnd(fromMinutes(data.workEndMinute));
    setLunchEnabled(data.lunchEnabled);
    if (data.lunchStartMinute != null) {
      setLunchStart(fromMinutes(data.lunchStartMinute));
    }
    if (data.lunchEndMinute != null) {
      setLunchEnd(fromMinutes(data.lunchEndMinute));
    }
    setWorkDays(bitmaskToDays(data.workDays));
  }, [data]);

  function toggleDay(day: number) {
    setWorkDays((previous) => {
      const next = new Set(previous);
      if (next.has(day)) {
        next.delete(day);
      } else {
        next.add(day);
      }
      return next;
    });
  }

  const workInvalid = toMinutes(workEnd) <= toMinutes(workStart);
  const lunchInvalid =
    lunchEnabled && toMinutes(lunchEnd) <= toMinutes(lunchStart);

  function handleSave() {
    if (workInvalid || lunchInvalid) return;

    mutate(
      {
        workStartMinute: toMinutes(workStart),
        workEndMinute: toMinutes(workEnd),
        lunchEnabled,
        lunchStartMinute: lunchEnabled ? toMinutes(lunchStart) : null,
        lunchEndMinute: lunchEnabled ? toMinutes(lunchEnd) : null,
        workDays: daysToBitmask(workDays),
      },
      {
        onSuccess: () => toast.success(t("settings:preferencesPage.workSaved")),
        onError: () => toast.error(t("settings:preferencesPage.workSaveError")),
      },
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-md font-medium">
          {t("settings:preferencesPage.workScheduleTitle")}
        </h2>
        <p className="text-xs text-muted-foreground">
          {t("settings:preferencesPage.workScheduleSubtitle")}
        </p>
      </div>

      <div className="space-y-4 border border-border rounded-md p-4 bg-sidebar">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="work-start">
              {t("settings:preferencesPage.workStart")}
            </Label>
            <Input
              id="work-start"
              type="time"
              value={workStart}
              onChange={(event) => setWorkStart(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="work-end">
              {t("settings:preferencesPage.workEnd")}
            </Label>
            <Input
              id="work-end"
              type="time"
              value={workEnd}
              onChange={(event) => setWorkEnd(event.target.value)}
            />
          </div>
        </div>
        {workInvalid && (
          <p className="text-destructive text-xs">
            {t("settings:preferencesPage.workTimesInvalid")}
          </p>
        )}

        <Separator />

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-sm font-medium">
              {t("settings:preferencesPage.lunchEnabled")}
            </Label>
            <p className="text-xs text-muted-foreground">
              {t("settings:preferencesPage.lunchEnabledDescription")}
            </p>
          </div>
          <Switch checked={lunchEnabled} onCheckedChange={setLunchEnabled} />
        </div>

        {lunchEnabled && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="lunch-start">
                {t("settings:preferencesPage.lunchStart")}
              </Label>
              <Input
                id="lunch-start"
                type="time"
                value={lunchStart}
                onChange={(event) => setLunchStart(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lunch-end">
                {t("settings:preferencesPage.lunchEnd")}
              </Label>
              <Input
                id="lunch-end"
                type="time"
                value={lunchEnd}
                onChange={(event) => setLunchEnd(event.target.value)}
              />
            </div>
          </div>
        )}
        {lunchInvalid && (
          <p className="text-destructive text-xs">
            {t("settings:preferencesPage.workTimesInvalid")}
          </p>
        )}

        <Separator />

        <div className="space-y-1.5">
          <Label>{t("settings:preferencesPage.workDays")}</Label>
          <div className="flex gap-1">
            {WEEKDAYS_MONDAY_FIRST.map((day) => (
              <button
                key={day}
                type="button"
                onClick={() => toggleDay(day)}
                aria-pressed={workDays.has(day)}
                className={cn(
                  "size-8 rounded-full border text-meta capitalize",
                  workDays.has(day)
                    ? "border-brand bg-brand/15 text-brand"
                    : "border-border/70 text-muted-foreground hover:border-brand/40",
                )}
              >
                {weekdayLabel(day).slice(0, 2)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isPending || workInvalid || lunchInvalid}
          >
            {t("common:actions.save")}
          </Button>
        </div>
      </div>
    </div>
  );
}
