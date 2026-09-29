import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { TimeSheetGroup } from "@/fetchers/time-sheet";

type TimeSheetEntry = TimeSheetGroup["entries"][number];

/** `2026-01-01T09:30`, lo que pide `<input type="datetime-local">`, en hora local. */
function toLocalInputValue(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Solo entradas ya cerradas: una en marcha se edita parandola primero -el
 * pie de la barra ya lo ofrece-, no reescribiendo su fin a mano.
 */
export function EditEntryForm({
  entry,
  isPending,
  onCancel,
  onSave,
}: {
  entry: TimeSheetEntry;
  isPending: boolean;
  onCancel: () => void;
  onSave: (input: { startTime: string; endTime: string }) => void;
}) {
  const { t } = useTranslation();
  const [start, setStart] = useState(() => toLocalInputValue(entry.startTime));
  const [end, setEnd] = useState(() =>
    entry.endTime ? toLocalInputValue(entry.endTime) : "",
  );

  const startDate = new Date(start);
  const endDate = new Date(end);
  const invalid =
    !start ||
    !end ||
    Number.isNaN(startDate.getTime()) ||
    Number.isNaN(endDate.getTime()) ||
    endDate < startDate;

  return (
    <form
      className="flex flex-col gap-2.5"
      onSubmit={(event) => {
        event.preventDefault();
        if (invalid) return;
        onSave({
          startTime: startDate.toISOString(),
          endTime: endDate.toISOString(),
        });
      }}
    >
      <p className="truncate text-body font-medium">{entry.taskTitle}</p>

      <div className="flex flex-col gap-1">
        <Label htmlFor={`edit-entry-start-${entry.id}`} className="text-meta">
          {t("schedule:createBlock.startTime")}
        </Label>
        <input
          id={`edit-entry-start-${entry.id}`}
          type="datetime-local"
          value={start}
          onChange={(event) => setStart(event.target.value)}
          className="h-8 rounded-md border border-border bg-background px-2 text-body"
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor={`edit-entry-end-${entry.id}`} className="text-meta">
          {t("schedule:createBlock.endTime")}
        </Label>
        <input
          id={`edit-entry-end-${entry.id}`}
          type="datetime-local"
          value={end}
          onChange={(event) => setEnd(event.target.value)}
          className="h-8 rounded-md border border-border bg-background px-2 text-body"
        />
      </div>

      {invalid && end && (
        <p className="text-destructive text-meta">
          {t("schedule:createBlock.timesInvalid")}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          {t("common:actions.cancel")}
        </Button>
        <Button type="submit" size="sm" disabled={invalid || isPending}>
          {t("common:actions.save")}
        </Button>
      </div>
    </form>
  );
}
