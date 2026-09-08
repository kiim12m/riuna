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
import { cn } from "@/lib/cn";

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
  span,
  isLoading,
  error,
  onEdit,
  onDelete,
  children,
}: {
  title: string;
  subtitle?: string;
  span: number;
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
    <section
      aria-labelledby={titleId}
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-background p-(--density-card-pad)",
        span === 2 && "sm:col-span-2",
        span === 3 && "sm:col-span-2 lg:col-span-3",
      )}
    >
      <header className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 id={titleId} className="truncate font-medium text-body">
            {title}
          </h3>
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

      {isLoading ? (
        <Skeleton className="h-24 w-full rounded-md" />
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
    </section>
  );
}
