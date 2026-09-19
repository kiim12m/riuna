import { Pause, Play, Plus, Repeat, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type { Cadence } from "@/fetchers/recurrence";
import {
  useCreateRecurrence,
  useDeleteRecurrence,
  useGetRecurrences,
  useUpdateRecurrence,
} from "@/hooks/queries/recurrence/use-recurrences";
import { cn } from "@/lib/cn";

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0];

/** El resumen legible de una cadencia, que es lo que la lista tiene que enseñar. */
function describeCadence(
  cadence: Cadence,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  if (cadence.frequency === "daily") {
    return t("settings:projectRecurrences.everyDays", {
      count: cadence.interval,
    });
  }

  if (cadence.frequency === "weekly") {
    const days = (cadence.byWeekday ?? [])
      .map((day) => t(`settings:projectRecurrences.weekdayShort.${day}`))
      .join(", ");
    return `${t("settings:projectRecurrences.everyWeeks", { count: cadence.interval })} · ${days}`;
  }

  return t("settings:projectRecurrences.everyMonths", {
    count: cadence.interval,
    day: cadence.byMonthDay,
  });
}

export default function RecurrenceEditor({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const { data: recurrences = [], isPending } = useGetRecurrences(projectId);
  const createRecurrence = useCreateRecurrence(projectId);
  const updateRecurrence = useUpdateRecurrence(projectId);
  const deleteRecurrence = useDeleteRecurrence(projectId);

  const [title, setTitle] = useState("");
  const [frequency, setFrequency] = useState<Cadence["frequency"]>("weekly");
  const [interval, setInterval] = useState(1);
  const [byWeekday, setByWeekday] = useState<number[]>([1]);
  const [byMonthDay, setByMonthDay] = useState(1);

  const invalid =
    !title.trim() || (frequency === "weekly" && byWeekday.length === 0);

  const submit = () => {
    const cadence: Cadence =
      frequency === "daily"
        ? { frequency, interval }
        : frequency === "weekly"
          ? { frequency, interval, byWeekday }
          : { frequency, interval, byMonthDay };

    createRecurrence.mutate(
      {
        template: { title: title.trim(), priority: "medium" },
        cadence,
        startsAt: new Date().toISOString(),
      },
      { onSuccess: () => setTitle("") },
    );
  };

  if (isPending) {
    return <Skeleton className="h-24 w-full rounded-lg" />;
  }

  return (
    <div className="space-y-4">
      {recurrences.length > 0 && (
        <ul className="space-y-2">
          {recurrences.map((recurrence) => {
            const template = recurrence.template as { title?: string };
            const cadence = recurrence.cadence as unknown as Cadence;

            return (
              <li
                key={recurrence.id}
                className={cn(
                  "flex items-center gap-3 rounded-lg border border-border px-3 py-2",
                  recurrence.active ? "" : "opacity-60",
                )}
              >
                <Repeat className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-sm">
                    {template.title}
                  </p>
                  <p className="truncate text-muted-foreground text-xs">
                    {describeCadence(cadence, t)}
                    {" · "}
                    {t("settings:projectRecurrences.generated", {
                      count: recurrence.generatedCount,
                    })}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={
                    recurrence.active
                      ? t("settings:projectRecurrences.pause")
                      : t("settings:projectRecurrences.resume")
                  }
                  onClick={() =>
                    updateRecurrence.mutate({
                      id: recurrence.id,
                      active: !recurrence.active,
                    })
                  }
                >
                  {recurrence.active ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("common:actions.delete")}
                  onClick={() => deleteRecurrence.mutate(recurrence.id)}
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="space-y-3 rounded-lg border border-border border-dashed p-3">
        <div className="space-y-1.5">
          <Label htmlFor="recurrence-title">
            {t("settings:projectRecurrences.taskTitle")}
          </Label>
          <Input
            id="recurrence-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t("settings:projectRecurrences.taskTitlePlaceholder")}
          />
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="recurrence-frequency">
              {t("settings:projectRecurrences.frequency")}
            </Label>
            <Select
              value={frequency}
              onValueChange={(next) =>
                setFrequency((next as Cadence["frequency"]) ?? "weekly")
              }
            >
              <SelectTrigger id="recurrence-frequency" className="w-36">
                <SelectValue>
                  {t(`settings:projectRecurrences.frequencies.${frequency}`)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {(["daily", "weekly", "monthly"] as const).map((option) => (
                  <SelectItem key={option} value={option}>
                    {t(`settings:projectRecurrences.frequencies.${option}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="recurrence-interval">
              {t("settings:projectRecurrences.interval")}
            </Label>
            <Input
              id="recurrence-interval"
              type="number"
              min={1}
              max={365}
              className="w-20"
              value={interval}
              onChange={(event) =>
                setInterval(Math.max(1, Number(event.target.value) || 1))
              }
            />
          </div>

          {frequency === "monthly" && (
            <div className="space-y-1.5">
              <Label htmlFor="recurrence-monthday">
                {t("settings:projectRecurrences.dayOfMonth")}
              </Label>
              <Input
                id="recurrence-monthday"
                type="number"
                min={1}
                max={31}
                className="w-20"
                value={byMonthDay}
                onChange={(event) =>
                  setByMonthDay(
                    Math.min(31, Math.max(1, Number(event.target.value) || 1)),
                  )
                }
              />
            </div>
          )}
        </div>

        {frequency === "weekly" && (
          <fieldset
            className="flex min-w-0 flex-wrap items-center gap-1"
            aria-label={t("settings:projectRecurrences.weekdays")}
          >
            {WEEKDAYS.map((day) => (
              <button
                key={day}
                type="button"
                aria-pressed={byWeekday.includes(day)}
                onClick={() =>
                  setByWeekday((current) =>
                    current.includes(day)
                      ? current.filter((value) => value !== day)
                      : [...current, day],
                  )
                }
                className={cn(
                  "h-7 w-9 rounded-md border text-xs transition-colors",
                  byWeekday.includes(day)
                    ? "border-border bg-accent text-foreground"
                    : "border-transparent text-muted-foreground hover:bg-accent/60",
                )}
              >
                {t(`settings:projectRecurrences.weekdayShort.${day}`)}
              </button>
            ))}
          </fieldset>
        )}

        <Button
          size="sm"
          disabled={invalid || createRecurrence.isPending}
          onClick={submit}
        >
          <Plus className="h-4 w-4" />
          {t("settings:projectRecurrences.add")}
        </Button>
      </div>
    </div>
  );
}
