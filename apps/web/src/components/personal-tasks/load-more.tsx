import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

/**
 * "Mostrando N de M" y "Cargar mas", al pie de la Lista y el Tablero de "Mis
 * tareas". Antes cortaban en 100 sin decirlo: con 140 tareas asignadas, 40 no
 * existian para esas dos vistas.
 */
export function LoadMore({
  shown,
  total,
  totalIsCapped,
  hasMore,
  isLoading,
  onLoadMore,
}: {
  shown: number;
  total: number;
  totalIsCapped: boolean;
  hasMore: boolean;
  isLoading: boolean;
  onLoadMore: () => void;
}) {
  const { t } = useTranslation();
  if (!hasMore) return null;

  return (
    <div className="flex items-center justify-center gap-3 py-3 text-meta text-muted-foreground">
      <span>
        {t("myTasks:shownOf", {
          shown,
          total: totalIsCapped ? `${total}+` : total,
        })}
      </span>
      <Button
        variant="outline"
        size="xs"
        onClick={onLoadMore}
        disabled={isLoading}
      >
        {t("myTasks:loadMore")}
      </Button>
    </div>
  );
}
