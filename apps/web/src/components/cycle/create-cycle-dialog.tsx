import { useState } from "react";
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
import type { CreateCyclePayload } from "@/fetchers/cycle";

function isoDay(offsetDays: number) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

export function CreateCycleDialog({
  open,
  onClose,
  onCreate,
  isPending,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (payload: CreateCyclePayload) => void;
  isPending: boolean;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  // Dos semanas es la duracion que casi todo el mundo usa; se puede cambiar.
  const [start, setStart] = useState(isoDay(0));
  const [end, setEnd] = useState(isoDay(14));

  const invalid = !name.trim() || end < start;

  const reset = () => {
    setName("");
    setGoal("");
    setStart(isoDay(0));
    setEnd(isoDay(14));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("cycles:create.title")}</DialogTitle>
          <DialogDescription>
            {t("cycles:create.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cycle-name">{t("cycles:create.name")}</Label>
            <Input
              id="cycle-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("cycles:create.namePlaceholder")}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cycle-goal">{t("cycles:create.goal")}</Label>
            <Input
              id="cycle-goal"
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              placeholder={t("cycles:create.goalPlaceholder")}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cycle-start">
                {t("cycles:create.startDate")}
              </Label>
              <Input
                id="cycle-start"
                type="date"
                value={start}
                onChange={(event) => setStart(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cycle-end">{t("cycles:create.endDate")}</Label>
              <Input
                id="cycle-end"
                type="date"
                value={end}
                onChange={(event) => setEnd(event.target.value)}
              />
            </div>
          </div>

          {end < start && (
            <p className="text-destructive text-xs">
              {t("cycles:create.datesInvalid")}
            </p>
          )}
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
                name: name.trim(),
                goal: goal.trim() || null,
                // La fecha llega como dia; se manda el instante local de ese dia
                // para que el servidor guarde lo que la persona eligio.
                startDate: new Date(`${start}T00:00:00`).toISOString(),
                endDate: new Date(`${end}T23:59:59`).toISOString(),
              });
              reset();
            }}
          >
            {t("cycles:create.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
