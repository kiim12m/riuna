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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Cycle } from "@/fetchers/cycle";

/**
 * Cerrar pregunta que hacer con lo que quedo sin terminar.
 *
 * No arrastra solo al siguiente ciclo: mover trabajo de una persona sin que
 * nadie lo confirme es como se pierden tareas de vista. El dialogo dice cuantas
 * son antes de preguntar, que es la mitad de la decision.
 */
export function CloseCycleDialog({
  cycle,
  candidates,
  pendingCount,
  open,
  onClose,
  onConfirm,
  isPending,
}: {
  cycle: Cycle;
  candidates: Cycle[];
  pendingCount: number;
  open: boolean;
  onClose: () => void;
  onConfirm: (destination: {
    unfinished: "backlog" | "cycle";
    targetCycleId?: string;
  }) => void;
  isPending: boolean;
}) {
  const { t } = useTranslation();
  const [target, setTarget] = useState<string>("backlog");

  const confirm = () => {
    onConfirm(
      target === "backlog"
        ? { unfinished: "backlog" }
        : { unfinished: "cycle", targetCycleId: target },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setTarget("backlog");
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("cycles:close.title", { name: cycle.name })}
          </DialogTitle>
          <DialogDescription>
            {pendingCount > 0
              ? t("cycles:close.description", { count: pendingCount })
              : t("cycles:close.descriptionEmpty")}
          </DialogDescription>
        </DialogHeader>

        {pendingCount > 0 && (
          <div className="space-y-1.5">
            <Label htmlFor="close-target">{t("cycles:close.moveTo")}</Label>
            <Select
              value={target}
              onValueChange={(next) => setTarget(String(next))}
            >
              <SelectTrigger id="close-target">
                <SelectValue>
                  {target === "backlog"
                    ? t("cycles:close.backlog")
                    : (candidates.find((item) => item.id === target)?.name ??
                      t("cycles:close.backlog"))}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="backlog">
                  {t("cycles:close.backlog")}
                </SelectItem>
                {candidates.map((candidate) => (
                  <SelectItem key={candidate.id} value={candidate.id}>
                    {candidate.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            {t("common:actions.cancel")}
          </Button>
          <Button size="sm" onClick={confirm} disabled={isPending}>
            {t("cycles:close.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
