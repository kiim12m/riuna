import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { TimeSheetGroup } from "@/fetchers/time-sheet";
import { useTimeSheetEntryMutations } from "@/hooks/mutations/time-sheet/use-time-sheet-entry-mutations";
import { formatDuration } from "@/lib/duration";
import { EditEntryForm } from "./edit-entry-form";

type TimeSheetEntry = TimeSheetGroup["entries"][number];

/**
 * Una entrada dentro de un grupo desplegado: siempre es propia -el parte de
 * horas no lee tiempo de nadie mas (ADR 042)-, asi que editar y borrar estan
 * disponibles sin comprobar nada mas.
 */
export function TimeSheetEntryRow({ entry }: { entry: TimeSheetEntry }) {
  const { t, i18n } = useTranslation();
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { update, isUpdating, remove, isRemoving } =
    useTimeSheetEntryMutations();

  const range = new Intl.DateTimeFormat(i18n.language, {
    hour: "2-digit",
    minute: "2-digit",
  });
  const startLabel = range.format(new Date(entry.startTime));
  const endLabel = entry.endTime
    ? range.format(new Date(entry.endTime))
    : t("schedule:running");

  return (
    <div className="flex items-center gap-2 py-1 pl-6 text-meta">
      <span className="font-mono tabular-nums text-muted-foreground">
        {startLabel} – {endLabel}
      </span>
      <span className="tabular-nums">
        {formatDuration(entry.seconds, i18n.language)}
      </span>
      <span className="ml-auto flex items-center gap-1">
        <Popover open={editOpen} onOpenChange={setEditOpen}>
          <PopoverTrigger
            aria-label={t("common:actions.edit")}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            disabled={!entry.endTime}
            title={
              entry.endTime
                ? t("common:actions.edit")
                : t("timeSheet:cannotEditRunning")
            }
          >
            <Pencil className="size-3.5" />
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 p-3">
            <EditEntryForm
              entry={entry}
              isPending={isUpdating}
              onCancel={() => setEditOpen(false)}
              onSave={(input) => {
                update(
                  { id: entry.id, ...input },
                  { onSuccess: () => setEditOpen(false) },
                );
              }}
            />
          </PopoverContent>
        </Popover>

        <button
          type="button"
          aria-label={t("common:actions.delete")}
          onClick={() => setConfirmDelete(true)}
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-3.5" />
        </button>
      </span>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("timeSheet:deleteEntry.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("timeSheet:deleteEntry.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" size="sm" />}>
              {t("common:actions.cancel")}
            </AlertDialogClose>
            <AlertDialogClose
              render={
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={isRemoving}
                  onClick={() => remove(entry.id)}
                />
              }
            >
              {t("common:actions.delete")}
            </AlertDialogClose>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
