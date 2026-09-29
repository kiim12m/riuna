import { MoreHorizontal, TriangleAlert } from "lucide-react";
import { type ReactNode, useId } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * El envoltorio de un widget.
 *
 * Es la cuarta aparicion de `rounded-lg border border-border p-3` con un titulo
 * encima —las otras tres estan en el panel de ciclos—, asi que aqui pasa a ser
 * un componente. No usa `Card`: `Card` es `rounded-2xl` con sombra y se usa hoy
 * solo en ajustes y autenticacion; una rejilla de doce tarjetas con esa
 * elevacion compite con el contenido, que es lo contrario del principio 1 de
 * `marca.md`.
 */
export function WidgetCard({
  title,
  subtitle,
  isLoading,
  error,
  onEdit,
  onDelete,
  children,
}: {
  title: string;
  subtitle?: string;
  isLoading?: boolean;
  error?: string;
  onEdit?: () => void;
  onDelete?: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();

  // Cada widget es una region con nombre: sin `aria-labelledby` un `<section>`
  // no tiene rol, asi que un panel de ocho tarjetas era para un lector de
  // pantalla un muro de contenido sin puntos de referencia.
  const titleId = useId();

  return (
    // `h-full min-h-0 overflow-hidden`: desde la ADR 043 la fila de la rejilla
    // tiene alto fijo, asi que la tarjeta lo ocupa entero y lo que no cabe hace
    // scroll en el cuerpo. El ancho y el alto los pone la celda, no la tarjeta.
    <section
      aria-labelledby={titleId}
      className="flex h-full min-h-0 min-w-0 flex-col gap-2 overflow-hidden rounded-lg border border-border bg-background p-(--density-card-pad)"
    >
      <header className="flex shrink-0 items-start gap-2">
        <div className="min-w-0 flex-1">
          {/* `h2`, no `h3`: el widget es el grupo de primer nivel bajo el
              saludo, que es el `h1` de la pagina. Saltarse el `h2` deja a un
              lector de pantalla sin el escalon intermedio para navegar.
              Y `text-section`, no `text-body`: a 14 px con peso 500 el titulo
              de un widget era tipograficamente identico al texto que lo rodea,
              asi que la jerarquia no la sostenia nada. */}
          <h2 id={titleId} className="truncate text-section">
            {title}
          </h2>
          {subtitle && (
            <p className="truncate text-muted-foreground text-meta">
              {subtitle}
            </p>
          )}
        </div>
        {(onEdit || onDelete) && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t("panels:widget.actions")}
                />
              }
            >
              <MoreHorizontal />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              {onEdit && (
                <DropdownMenuItem onClick={onEdit}>
                  {t("common:actions.edit")}
                </DropdownMenuItem>
              )}
              {onDelete && (
                <DropdownMenuItem onClick={onDelete}>
                  {t("common:actions.delete")}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>

      {/* El `min-h-0` es imprescindible: sin el, un hijo flexible se niega a
          encoger por debajo de su contenido y la tarjeta desborda la fila en
          vez de hacer scroll dentro. */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {isLoading ? (
          <Skeleton className="h-full min-h-16 w-full rounded-md" />
        ) : error ? (
          // Un widget roto no deja el panel en blanco: lo dice y sigue. El caso
          // real es archivar una definicion de campo que su filtro nombra.
          <p className="flex items-start gap-2 py-4 text-muted-foreground text-meta">
            <TriangleAlert className="mt-px size-3.5 shrink-0 text-warning-foreground" />
            <span>{error}</span>
          </p>
        ) : (
          children
        )}
      </div>
    </section>
  );
}
