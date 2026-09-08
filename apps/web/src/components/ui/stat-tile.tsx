import { cn } from "@/lib/cn";

/**
 * Una cifra con su rotulo. La unica pieza de "numero grande" del producto.
 *
 * Vivia sin exportar dentro del panel de ciclos; los paneles de la Fase 7 son
 * su segundo consumidor y no tenia sentido copiarla. `tabular-nums` es lo que
 * evita que la cifra baile al refrescarse.
 */
export function StatTile({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-background p-(--density-card-pad)",
        className,
      )}
    >
      <p className="text-muted-foreground text-meta">{label}</p>
      <p className="font-semibold text-lg tabular-nums">{value}</p>
      {hint && (
        <p className="mt-0.5 text-muted-foreground/70 text-meta">{hint}</p>
      )}
    </div>
  );
}

export default StatTile;
