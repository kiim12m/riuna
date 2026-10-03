import { Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTimeOffMutations } from "@/hooks/mutations/availability/use-availability-mutations";
import { useTimeOff } from "@/hooks/queries/availability/use-availability";
import useActiveWorkspace from "@/hooks/queries/workspace/use-active-workspace";
import { HttpError } from "@/lib/http-error";
import { toast } from "@/lib/toast";

/**
 * Las ausencias de quien mira en el espacio activo (ADR 060), junto a su
 * jornada: un rango de dias y una nota opcional que solo ve ella. **Sin
 * motivo**, a proposito: una baja medica es un dato sensible.
 */
export function TimeOffSection() {
  const { t, i18n } = useTranslation();
  const { data: workspace } = useActiveWorkspace();
  const workspaceId = workspace?.id ?? "";
  const { data: absences } = useTimeOff(workspaceId);
  const { create, remove } = useTimeOffMutations(workspaceId);
  const startId = useId();
  const endId = useId();
  const noteId = useId();
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [note, setNote] = useState("");

  if (!workspace) return null;

  const range = new Intl.DateTimeFormat(i18n.language, {
    day: "numeric",
    month: "long",
  });
  const invalid = !startsOn || !endsOn || endsOn < startsOn;

  const add = () =>
    create.mutate(
      { startsOn, endsOn, note: note.trim() || null },
      {
        onSuccess: () => {
          setStartsOn("");
          setEndsOn("");
          setNote("");
        },
        onError: (error) =>
          toast.error(
            error instanceof HttpError && error.status === 400
              ? t("availability:timeOff.tooLong")
              : t("availability:timeOff.error"),
          ),
      },
    );

  return (
    <div className="space-y-6" data-testid="time-off-section">
      <div className="space-y-1">
        <h2 className="text-md font-medium">
          {t("availability:timeOff.title")}
        </h2>
        <p className="text-xs text-muted-foreground">
          {t("availability:timeOff.subtitle", { workspace: workspace.name })}
        </p>
      </div>
      <div className="space-y-4 rounded-md border border-border bg-sidebar p-4">
        {absences && absences.length > 0 ? (
          <ul className="space-y-2">
            {absences.map((absence) => (
              <li
                key={absence.id}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <div className="min-w-0">
                  <p>
                    {range.formatRange(
                      new Date(absence.startsOn),
                      new Date(absence.endsOn),
                    )}
                  </p>
                  {absence.note && (
                    <p className="truncate text-xs text-muted-foreground">
                      {absence.note}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("availability:timeOff.remove")}
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(absence.id)}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("availability:timeOff.empty")}
          </p>
        )}

        <div className="grid gap-3 border-border border-t pt-4 sm:grid-cols-[auto_auto_1fr_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor={startId}>{t("availability:timeOff.from")}</Label>
            <Input
              id={startId}
              type="date"
              value={startsOn}
              onChange={(event) => {
                setStartsOn(event.target.value);
                if (!endsOn || event.target.value > endsOn) {
                  setEndsOn(event.target.value);
                }
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={endId}>{t("availability:timeOff.to")}</Label>
            <Input
              id={endId}
              type="date"
              min={startsOn || undefined}
              value={endsOn}
              onChange={(event) => setEndsOn(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={noteId}>{t("availability:timeOff.note")}</Label>
            <Input
              id={noteId}
              maxLength={500}
              placeholder={t("availability:timeOff.notePlaceholder")}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
          <Button disabled={invalid || create.isPending} onClick={add}>
            {t("availability:timeOff.add")}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("availability:timeOff.privacy")}
        </p>
      </div>
    </div>
  );
}
