import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Textarea } from "@/components/ui/textarea";

/** La valoracion: solo la ve la propia persona (ADR 054). */
export function RatingStep({
  impact,
  energy,
  note,
  onImpact,
  onEnergy,
  onNote,
}: {
  impact: number | null;
  energy: number | null;
  note: string;
  onImpact: (value: number) => void;
  onEnergy: (value: number) => void;
  onNote: (value: string) => void;
}) {
  const { t } = useTranslation();
  const noteId = useId();

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <p className="text-meta text-muted-foreground">
          {t("rituals:closeDay.rating.impact")}
        </p>
        <SegmentedControl
          label={t("rituals:closeDay.rating.impact")}
          value={impact === null ? "" : String(impact)}
          onValueChange={(value) => onImpact(Number(value))}
          options={(["1", "2", "3", "4"] as const).map((level) => ({
            value: level,
            label: t(`rituals:closeDay.rating.impactLevels.${level}`),
          }))}
        />
      </div>
      <div className="space-y-1.5">
        <p className="text-meta text-muted-foreground">
          {t("rituals:closeDay.rating.energy")}
        </p>
        <SegmentedControl
          label={t("rituals:closeDay.rating.energy")}
          value={energy === null ? "" : String(energy)}
          onValueChange={(value) => onEnergy(Number(value))}
          options={(["1", "2", "3"] as const).map((level) => ({
            value: level,
            label: t(`rituals:closeDay.rating.energyLevels.${level}`),
          }))}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={noteId}>{t("rituals:closeDay.rating.note")}</Label>
        <Textarea
          id={noteId}
          value={note}
          onChange={(event) => onNote(event.target.value)}
          maxLength={4000}
        />
      </div>
    </div>
  );
}
