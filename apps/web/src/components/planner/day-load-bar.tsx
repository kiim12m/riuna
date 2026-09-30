import { cn } from "@/lib/cn";

/**
 * La barra de carga del dia, la misma en el Planificador y en el Cronograma:
 * teal hasta la jornada, ambar al pasarse -mas de lo que cabe en el dia-.
 */
export function DayLoadBar({ pct }: { pct: number }) {
  return (
    <div className="h-1 overflow-hidden rounded-full bg-muted-foreground/15">
      <div
        className={cn(
          "h-full rounded-full",
          pct > 100 ? "bg-warning" : "bg-brand",
        )}
        style={{ width: `${Math.min(pct, 100)}%` }}
      />
    </div>
  );
}
