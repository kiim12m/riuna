import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * El titulo dentro del lienzo de una pantalla del espacio personal, como en
 * `docs/design-previews/barra-lateral.html`: la miga de pan de la cabecera
 * dice donde se esta, esto dice que se esta mirando. Mismo marcado que
 * `GreetingHeader` en Mi panel, con un hueco para las acciones de la pantalla.
 */
export function PageHeading({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-wrap items-end justify-between gap-x-4 gap-y-2",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="text-balance text-page">{title}</h1>
        {description && (
          <p className="max-w-[65ch] text-meta text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </header>
  );
}
