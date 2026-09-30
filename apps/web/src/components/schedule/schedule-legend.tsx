import { useTranslation } from "react-i18next";
import { type SegmentTone, segmentToneClass } from "./segment-tone";

const TONES: SegmentTone[] = [
  "plan",
  "fixed",
  "running",
  "closed",
  "projected",
];

/**
 * Que significa cada tono de la rejilla. Las muestras salen del mismo
 * `segmentToneClass` que los tramos, asi que no pueden desviarse de ellos.
 */
export function ScheduleLegend() {
  const { t } = useTranslation();

  return (
    <ul
      aria-label={t("schedule:legend.label")}
      className="flex flex-wrap gap-x-3.5 gap-y-1 text-meta text-muted-foreground"
    >
      {TONES.map((tone) => (
        <li key={tone} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className={segmentToneClass(tone, "size-2.5 rounded-[2px]")}
          />
          {t(`schedule:legend.${tone}`)}
        </li>
      ))}
    </ul>
  );
}
