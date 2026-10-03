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
import type { CreateBlockInput, UpdateBlockInput } from "@/fetchers/schedule";
import { cn } from "@/lib/cn";
import { dayKey } from "@/lib/day-key";
import { fromMinutes, toMinutes } from "@/lib/minutes";
import { WEEKDAYS_MONDAY_FIRST, weekdayLabel } from "@/lib/weekdays";
import type { EditableBlock } from "./time-grid";

/** `yyyy-mm-dd` de un ISO que llega del servidor -Hono serializa los `Date`
 * a texto-, o cadena vacia si no hay fecha. El dia sale de la hora **local**:
 * la API guarda la medianoche de Madrid (ADR 049), que en UTC es la vispera a
 * las 22:00, y cortar el ISO por los diez primeros caracteres daria el dia
 * anterior -y guardar el dialogo moveria el bloque-. */
function toDayInput(iso: string | null): string {
  return iso ? dayKey(new Date(iso)) : "";
}

/**
 * Crea un bloque, o edita uno ya existente -`editingBlock` decide cual-.
 * Nunca cambia si es suelto o repetido (ver `update-block.ts`): en edicion,
 * uno suelto solo puede mover su dia; uno repetido, solo poner o quitar
 * `endsAt`. Los dias de la semana de una serie no se pueden tocar aqui -se
 * ven de fondo, sin poder pulsarlos-, y cambiar de forma sigue siendo
 * borrar y crear de nuevo, como ya lo era antes de poder editar nada.
 */
export function CreateBlockDialog({
  open,
  day,
  editingBlock,
  onClose,
  onCreate,
  onUpdate,
  onRequestDelete,
  isPending,
}: {
  open: boolean;
  /** Dia sobre el que se crea, cuando no se esta editando. */
  day: string;
  /** `null`: modo crear. Si no, el bloque que se esta editando. */
  editingBlock: EditableBlock | null;
  onClose: () => void;
  onCreate: (input: CreateBlockInput) => void;
  onUpdate: (id: string, input: UpdateBlockInput) => void;
  onRequestDelete: (id: string) => void;
  isPending: boolean;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<"fixed" | "break">("fixed");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [plannedDateValue, setPlannedDateValue] = useState("");
  const [endsAtValue, setEndsAtValue] = useState("");

  useEffect(() => {
    if (!open) return;
    if (editingBlock) {
      setTitle(editingBlock.title);
      // La columna de la base es `text` a secas (`kind: text("kind")`), sin
      // el literal `"fixed" | "break"` que si tiene `BlockerInput` -la CHECK
      // `schedule_block_kind_valid` es quien de verdad lo garantiza en runtime.
      setKind(editingBlock.kind as "fixed" | "break");
      setStartTime(fromMinutes(editingBlock.startMinute));
      setEndTime(fromMinutes(editingBlock.endMinute));
      setPlannedDateValue(toDayInput(editingBlock.plannedDate));
      setEndsAtValue(toDayInput(editingBlock.endsAt));
    } else {
      setTitle("");
      setKind("fixed");
      setStartTime("09:00");
      setEndTime("10:00");
      setWeekdays([]);
      setPlannedDateValue(day);
      setEndsAtValue("");
    }
  }, [open, editingBlock, day]);

  const startMinute = toMinutes(startTime);
  const endMinute = toMinutes(endTime);
  const isRepeating = editingBlock
    ? Boolean(editingBlock.cadence)
    : weekdays.length > 0;
  const invalid =
    !title.trim() ||
    endMinute <= startMinute ||
    (!isRepeating && !plannedDateValue);

  const toggleWeekday = (value: number) => {
    if (editingBlock) return; // solo lectura en edicion, ver comentario de arriba
    setWeekdays((current) =>
      current.includes(value)
        ? current.filter((weekday) => weekday !== value)
        : [...current, value],
    );
  };

  const existingWeekdays: number[] =
    editingBlock?.cadence && Array.isArray(editingBlock.cadence.byWeekday)
      ? (editingBlock.cadence.byWeekday as number[])
      : weekdays;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editingBlock
              ? t("schedule:createBlock.editTitle")
              : t("schedule:createBlock.title")}
          </DialogTitle>
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

          {/* Suelto (nunca repite): el dia es editable siempre -al crear, es
           * el dia sobre el que se pulso "+"; al editar, se puede mover a
           * otro-. */}
          {!isRepeating && (
            <div className="space-y-1.5">
              <Label htmlFor="block-day">{t("schedule:createBlock.day")}</Label>
              <Input
                id="block-day"
                type="date"
                value={plannedDateValue}
                onChange={(event) => setPlannedDateValue(event.target.value)}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>{t("schedule:createBlock.repeat")}</Label>
            <div className="flex gap-1">
              {WEEKDAYS_MONDAY_FIRST.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => toggleWeekday(value)}
                  disabled={editingBlock !== null}
                  className={cn(
                    "size-8 rounded-full border text-meta capitalize",
                    editingBlock !== null && "cursor-default opacity-70",
                    existingWeekdays.includes(value)
                      ? "border-brand bg-brand/15 text-brand"
                      : "border-border/70 text-muted-foreground hover:border-brand/40",
                  )}
                >
                  {weekdayLabel(value).slice(0, 2)}
                </button>
              ))}
            </div>
            <p className="text-meta text-muted-foreground">
              {existingWeekdays.length === 0
                ? t("schedule:createBlock.repeatNone")
                : t("schedule:createBlock.repeatSome")}
            </p>
          </div>

          {/* Repite: solo se puede poner o quitar el limite -que dias
           * repite no se toca aqui, ver comentario de cabecera-. */}
          {isRepeating && editingBlock && (
            <div className="space-y-1.5">
              <Label htmlFor="block-ends-at">
                {t("schedule:createBlock.until")}
              </Label>
              <Input
                id="block-ends-at"
                type="date"
                value={endsAtValue}
                onChange={(event) => setEndsAtValue(event.target.value)}
              />
              <p className="text-meta text-muted-foreground">
                {endsAtValue
                  ? t("schedule:createBlock.untilSet")
                  : t("schedule:createBlock.untilNone")}
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          {editingBlock && (
            <Button
              variant="destructive"
              size="sm"
              className="mr-auto"
              onClick={() => onRequestDelete(editingBlock.id)}
            >
              {t("common:actions.delete")}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onClose}>
            {t("common:actions.cancel")}
          </Button>
          <Button
            size="sm"
            disabled={invalid || isPending}
            onClick={() => {
              if (editingBlock) {
                onUpdate(editingBlock.id, {
                  title: title.trim(),
                  kind,
                  startMinute,
                  endMinute,
                  ...(isRepeating
                    ? { endsAt: endsAtValue || null }
                    : { plannedDate: plannedDateValue }),
                });
                return;
              }
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
                  : { plannedDate: plannedDateValue }),
              });
            }}
          >
            {editingBlock
              ? t("common:actions.save")
              : t("schedule:createBlock.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
