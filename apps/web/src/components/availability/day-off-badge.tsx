import { CalendarOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";

export type DayOff = { kind: "holiday" | "time-off"; name: string | null };

/**
 * Un dia no disponible (ADR 060): «Festivo · nombre» o «Ausente». Nunca la
 * nota de la ausencia, que la API ni siquiera manda aqui.
 */
export function DayOffBadge({
  dayOff,
  className,
}: {
  dayOff: DayOff;
  className?: string;
}) {
  const { t } = useTranslation();
  const label =
    dayOff.kind === "holiday"
      ? t("availability:day.holiday", { name: dayOff.name ?? "" })
      : t("availability:day.timeOff");

  return (
    <span
      title={label}
      data-testid="day-off-badge"
      className={cn(
        "inline-flex min-w-0 items-center gap-1 rounded bg-muted px-1.5 text-meta text-muted-foreground",
        className,
      )}
    >
      <CalendarOff className="size-3 shrink-0" />
      <span className="truncate">{label}</span>
    </span>
  );
}
