-- La rejilla del panel pasa de tres columnas a doce (ADR 043). Los `span`
-- guardados eran tercios, asi que se multiplican por cuatro: 1 -> 4, 2 -> 8 y
-- 3 -> 12 reproducen la distribucion anterior al pixel. Sin esto, cada widget
-- de cada panel ya existente se colapsaria a un doceavo de ancho.
--
-- Escrita a mano: no hay cambio de esquema, solo datos. Mismo caso que la 0060.
UPDATE "dashboard_widget" SET "span" = "span" * 4 WHERE "span" BETWEEN 1 AND 3;--> statement-breakpoint
-- Y un alto por tipo. El defecto de la columna es 1 para todos, que deja una
-- lista de veinte filas en una sola fila de rejilla: un recorte, no un widget.
-- Es la misma tabla que `DEFAULT_WIDGET_SIZE` en `dashboard/widget-config.ts`.
UPDATE "dashboard_widget" SET "row_span" = CASE "type"
  WHEN 'table' THEN 4
  WHEN 'inbox' THEN 4
  WHEN 'week' THEN 2
  WHEN 'trend' THEN 2
  WHEN 'breakdown' THEN 2
  WHEN 'time' THEN 2
  WHEN 'epic_progress' THEN 2
  WHEN 'goal' THEN 2
  ELSE 1
END;
