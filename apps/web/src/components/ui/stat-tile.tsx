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
      {/* `text-page`, no `text-lg`: 18 px no es ninguno de los siete papeles de
          marca.md §05, y la cifra de una tarjeta es el elemento que la encabeza. */}
      <p className="text-page tabular-nums">{value}</p>
      {hint && (
        <p className="mt-0.5 text-muted-foreground/70 text-meta">{hint}</p>
      )}
    </div>
  );
}

export default StatTile;
