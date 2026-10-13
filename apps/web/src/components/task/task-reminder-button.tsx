import { AlarmClock, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useSetTaskReminder } from "@/hooks/mutations/task-reminder/use-set-task-reminder";
import { useTaskReminder } from "@/hooks/queries/task-reminder/use-task-reminder";
import { cn } from "@/lib/cn";
import {
  formatReminderTime as formatWhen,
  PRESET_HOUR,
  REMINDER_PRESETS,
  reminderFromInputs,
  reminderPresetDate,
} from "@/lib/reminders/task-reminder-presets";
import { toast } from "@/lib/toast";

type TaskReminderButtonProps = {
  taskId: string;
  /** Sin la fecha ni la palabra, para el lateral estrecho del escritorio. */
  iconOnly?: boolean;
  className?: string;
};

function toDayInput(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * «Recuérdamelo» en el detalle de la tarea (ADR 077): un aviso privado a la
 * hora que elijas, por la campana y tus canales. No planifica la tarea.
 */
export default function TaskReminderButton({
  taskId,
  iconOnly = false,
  className,
}: TaskReminderButtonProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(false);
  const [note, setNote] = useState("");
  const [day, setDay] = useState("");
  const [time, setTime] = useState(
    `${String(PRESET_HOUR).padStart(2, "0")}:00`,
  );
  const { data: reminder } = useTaskReminder(taskId);
  const { mutate: setReminder, isPending } = useSetTaskReminder(taskId);

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setNote(reminder?.note ?? "");
      setCustom(false);
      setDay(toDayInput(reminderPresetDate("tomorrow")));
    }
  };

  const save = (remindAt: Date | null) =>
    setReminder(
      { remindAt, note: note.trim() || null },
      {
        onSuccess: () => {
          setOpen(false);
          toast.success(
            remindAt
              ? t("tasks:reminder.saved", { when: formatWhen(remindAt) })
              : t("tasks:reminder.cleared"),
          );
        },
        onError: (error) =>
          toast.error(
            error instanceof Error
              ? error.message
              : t("tasks:reminder.saveError"),
          ),
      },
    );

  const customDate = reminderFromInputs(day, time);
  const customInPast = customDate ? customDate.getTime() <= Date.now() : false;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          data-testid="task-reminder-button"
          className={cn(
            "gap-1.5 text-foreground",
            reminder && "border-brand/45 bg-accent text-brand-strong",
            className,
          )}
        >
          <AlarmClock className="size-4" />
          <span className={iconOnly ? "sr-only" : "hidden sm:inline"}>
            {reminder
              ? formatWhen(reminder.remindAt)
              : t("tasks:reminder.button")}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-1" align="end">
        {reminder && (
          <div className="mb-1 flex items-start gap-2 rounded-md border border-brand/35 bg-accent px-2.5 py-2 text-sm">
            <AlarmClock className="mt-0.5 size-4 shrink-0 text-brand-strong" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {t("tasks:reminder.current", {
                  when: formatWhen(reminder.remindAt),
                })}
              </p>
              <p className="truncate text-meta text-muted-foreground">
                {reminder.note
                  ? `«${reminder.note}»`
                  : t("tasks:reminder.noNote")}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-6 shrink-0"
              disabled={isPending}
              aria-label={t("tasks:reminder.clear")}
              data-testid="task-reminder-clear"
              onClick={() => save(null)}
            >
              <X className="size-3.5" />
            </Button>
          </div>
        )}

        <p className="px-2 pt-1.5 pb-1 text-label font-semibold uppercase tracking-wide text-muted-foreground">
          {reminder ? t("tasks:reminder.change") : t("tasks:reminder.button")}
        </p>
        {REMINDER_PRESETS.map((preset) => {
          const date = reminderPresetDate(preset);
          return (
            <Button
              key={preset}
              variant="ghost"
              size="sm"
              className="h-8 w-full justify-between gap-2 px-2"
              disabled={isPending}
              data-testid={`task-reminder-preset-${preset}`}
              onClick={() => save(date)}
            >
              <span>{t(`tasks:reminder.presets.${preset}`)}</span>
              <span className="text-meta text-muted-foreground">
                {formatWhen(date)}
              </span>
            </Button>
          );
        })}

        {custom ? (
          <div className="space-y-2 px-2 py-1.5">
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Input
                type="date"
                aria-label={t("tasks:reminder.day")}
                value={day}
                onChange={(event) => setDay(event.target.value)}
              />
              <Input
                type="time"
                aria-label={t("tasks:reminder.time")}
                value={time}
                onChange={(event) => setTime(event.target.value)}
              />
            </div>
            {customInPast && (
              <p className="text-meta text-destructive">
                {t("tasks:reminder.inPast")}
              </p>
            )}
            <Button
              size="sm"
              className="w-full"
              disabled={isPending || !customDate || customInPast}
              onClick={() => customDate && save(customDate)}
            >
              {t("tasks:reminder.save")}
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-full justify-start px-2"
            onClick={() => setCustom(true)}
          >
            {t("tasks:reminder.presets.custom")}
          </Button>
        )}

        <div className="space-y-1 px-2 pt-1.5">
          <Label htmlFor={`reminder-note-${taskId}`} className="text-meta">
            {t("tasks:reminder.note")}
          </Label>
          <Input
            id={`reminder-note-${taskId}`}
            value={note}
            maxLength={280}
            placeholder={t("tasks:reminder.notePlaceholder")}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
        <p className="px-2 py-1.5 text-meta leading-snug text-muted-foreground">
          {t("tasks:reminder.help")}
        </p>
      </PopoverContent>
    </Popover>
  );
}
