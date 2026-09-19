// Cuatro prioridades, cuatro colores. Antes media y alta eran el mismo ámbar a
// distinta opacidad, es decir indistinguibles justo cuando hace falta
// distinguirlas. El neutro en «baja» dice «no corre prisa». Ver docs/marca.md §06.
const priorityColors = {
  low: "text-muted-foreground",
  medium: "text-info-foreground",
  high: "text-warning-foreground",
  urgent: "text-destructive-foreground",
};

export const priorityColorsFilter = priorityColors;
export const priorityColorsTaskCard = priorityColors;
