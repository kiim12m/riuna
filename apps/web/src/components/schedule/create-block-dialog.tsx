import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CreateBlockInput } from "@/fetchers/schedule";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";

// 1 de enero de 2023 fue domingo: referencia estable para nombrar los siete
// dias de la semana sin depender de en que dia corre esto.
const WEEK_REFERENCE_SUNDAY = new Date(Date.UTC(2023, 0, 1));
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0];

function weekdayLabel(day: number) {
  const reference = new Date(WEEK_REFERENCE_SUNDAY);
  reference.setUTCDate(reference.getUTCDate() + day);
  return formatDate(reference, { weekday: "short" });
}

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

export function CreateBlockDialog({
  open,
  day,
  onClose,
  onCreate,
  isPending,
}: {
  open: boolean;
  day: string;
  onClose: () => void;
  onCreate: (input: CreateBlockInput) => void;
  isPending: boolean;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<"fixed" | "break">("fixed");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [weekdays, setWeekdays] = useState<number[]>([]);

  useEffect(() => {
    if (open) {
      setTitle("");
      setKind("fixed");
      setStartTime("09:00");
      setEndTime("10:00");
      setWeekdays([]);
    }
  }, [open]);

  const startMinute = toMinutes(startTime);
  const endMinute = toMinutes(endTime);
  const invalid = !title.trim() || endMinute <= startMinute;

  const toggleWeekday = (value: number) => {
    setWeekdays((current) =>
      current.includes(value)
        ? current.filter((weekday) => weekday !== value)
        : [...current, value],
    );
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("schedule:createBlock.title")}</DialogTitle>
          <DialogDescription>
            {t("schedule:createBlock.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="block-title">
              {t("schedule:createBlock.name")}
            </Label>
            <Input
              id="block-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t("schedule:createBlock.namePlaceholder")}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="block-kind">{t("schedule:createBlock.kind")}</Label>
            <Select
              value={kind}
              onValueChange={(value) => setKind(value as "fixed" | "break")}
            >
              <SelectTrigger id="block-kind">
                <SelectValue>
                  {kind === "fixed"
                    ? t("schedule:createBlock.kindFixed")
                    : t("schedule:createBlock.kindBreak")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fixed">
                  {t("schedule:createBlock.kindFixed")}
                </SelectItem>
                <SelectItem value="break">
                  {t("schedule:createBlock.kindBreak")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="block-start">
                {t("schedule:createBlock.startTime")}
              </Label>
              <Input
                id="block-start"
                type="time"
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="block-end">
                {t("schedule:createBlock.endTime")}
              </Label>
              <Input
                id="block-end"
                type="time"
                value={endTime}
                onChange={(event) => setEndTime(event.target.value)}
              />
            </div>
          </div>

          {endMinute <= startMinute && (
            <p className="text-destructive text-xs">
              {t("schedule:createBlock.timesInvalid")}
            </p>
          )}

          <div className="space-y-1.5">
            <Label>{t("schedule:createBlock.repeat")}</Label>
            <div className="flex gap-1">
              {WEEKDAYS.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => toggleWeekday(value)}
                  className={cn(
                    "size-8 rounded-full border text-meta capitalize",
                    weekdays.includes(value)
                      ? "border-brand bg-brand/15 text-brand"
                      : "border-border/70 text-muted-foreground hover:border-brand/40",
                  )}
                >
                  {weekdayLabel(value).slice(0, 2)}
                </button>
              ))}
            </div>
            <p className="text-meta text-muted-foreground">
              {weekdays.length === 0
                ? t("schedule:createBlock.repeatNone")
                : t("schedule:createBlock.repeatSome")}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            {t("common:actions.cancel")}
          </Button>
          <Button
            size="sm"
            disabled={invalid || isPending}
            onClick={() => {
              onCreate({
                title: title.trim(),
                kind,
                startMinute,
                endMinute,
                ...(weekdays.length > 0
                  ? {
                      cadence: {
                        frequency: "weekly",
                        interval: 1,
                        byWeekday: weekdays,
                      },
                    }
                  : { plannedDate: day }),
              });
            }}
          >
            {t("schedule:createBlock.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
