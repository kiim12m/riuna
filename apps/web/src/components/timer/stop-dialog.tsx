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

/** `2026-01-01T09:30`, lo que pide `<input type="datetime-local">`, en hora local. */
function toLocalInputValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Al parar una entrada de mas de diez horas, pregunta la hora real de fin
 * en vez de estampar "ahora": es el cronometro que alguien olvido parar de
 * un dia para otro, no una jornada de verdad.
 */
export function StopDialog({
  open,
  onClose,
  onConfirm,
  isPending,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (endTime: string) => void;
  isPending: boolean;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState(() => toLocalInputValue(new Date()));

  useEffect(() => {
    if (open) setValue(toLocalInputValue(new Date()));
  }, [open]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("timer:stopDialog.title")}</DialogTitle>
          <DialogDescription>
            {t("timer:stopDialog.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="stop-dialog-end-time">
            {t("timer:stopDialog.endTime")}
          </Label>
          <Input
            id="stop-dialog-end-time"
            type="datetime-local"
            value={value}
            max={toLocalInputValue(new Date())}
            onChange={(event) => setValue(event.target.value)}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common:actions.cancel")}
          </Button>
          <Button
            onClick={() => onConfirm(new Date(value).toISOString())}
            disabled={isPending || !value}
          >
            {t("timer:stop")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
