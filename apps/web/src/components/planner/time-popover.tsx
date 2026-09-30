import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { fromMinutes, toMinutes } from "@/lib/minutes";

/**
 * Pone o quita la hora de una entrada del Planificador. El mismo componente
 * sirve para las dos vias: soltar una tarjeta en "Con hora" lo abre ya
 * controlado (`open`/`onOpenChange` desde fuera); pulsar la hora de una ya
 * anclada lo abre por su cuenta con su propio disparador.
 */
export function TimePopover({
  minute,
  onSave,
  onRemove,
  open,
  onOpenChange,
}: {
  minute: number;
  onSave: (minute: number) => void;
  onRemove: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(() => fromMinutes(minute));

  useEffect(() => {
    if (open) setDraft(fromMinutes(minute));
  }, [open, minute]);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        className="shrink-0 rounded px-1 font-mono text-meta text-muted-foreground tabular-nums hover:bg-accent hover:text-foreground"
      >
        {fromMinutes(minute)}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-52 space-y-2 p-3"
        onClick={(event) => event.stopPropagation()}
      >
        <Label htmlFor="planner-anchor-time" className="text-meta">
          {t("planner:anchorTime")}
        </Label>
        <Input
          id="planner-anchor-time"
          type="time"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <div className="flex justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              onOpenChange?.(false);
              onRemove();
            }}
          >
            {t("planner:removeTime")}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              onOpenChange?.(false);
              onSave(toMinutes(draft));
            }}
          >
            {t("common:actions.save")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
