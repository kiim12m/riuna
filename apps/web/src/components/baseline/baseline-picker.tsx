import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BASELINE_PRESETS,
  type BaselineChoice,
  baselineDayKey,
  isBaselinePreset,
} from "@/lib/baseline";
import { dayKey } from "@/lib/day-key";

/**
 * El selector de linea base de una vista (ADR 085): ninguna, un relativo o un
 * dia concreto. Lo comparten la Tabla y el Gantt.
 */
export function BaselinePicker({
  value,
  onChange,
}: {
  value: BaselineChoice | undefined;
  onChange: (next: BaselineChoice | undefined) => void;
}) {
  const { t } = useTranslation();
  const todayKey = dayKey(new Date());
  const selected = !value ? "none" : isBaselinePreset(value) ? value : "date";

  return (
    <div className="flex items-center gap-1">
      <Select
        value={selected}
        onValueChange={(next) => {
          if (next === "none") onChange(undefined);
          // Elegir «Fecha…» arranca en hace una semana, para tener algo que
          // comparar mientras se escoge el dia.
          else if (next === "date") onChange(baselineDayKey("week", todayKey));
          else onChange(next as BaselineChoice);
        }}
      >
        <SelectTrigger
          size="sm"
          className="h-6 w-auto gap-1.5 border-0 bg-transparent px-2 text-xs shadow-none"
          aria-label={t("tasks:baseline.label")}
          data-testid="baseline-picker"
        >
          <SelectValue>
            {t("tasks:baseline.label")}: {t(`tasks:baseline.${selected}`)}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">{t("tasks:baseline.none")}</SelectItem>
          {BASELINE_PRESETS.map((preset) => (
            <SelectItem key={preset} value={preset}>
              {t(`tasks:baseline.${preset}`)}
            </SelectItem>
          ))}
          <SelectItem value="date">{t("tasks:baseline.date")}</SelectItem>
        </SelectContent>
      </Select>
      {selected === "date" && value && (
        <Input
          type="date"
          size="sm"
          value={value}
          max={todayKey}
          aria-label={t("tasks:baseline.dateLabel")}
          data-testid="baseline-date"
          className="h-6 w-36 text-xs"
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
            if (event.target.value && event.target.value <= todayKey) {
              onChange(event.target.value);
            }
          }}
        />
      )}
    </div>
  );
}
