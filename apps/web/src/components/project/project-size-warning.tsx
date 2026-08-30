import { TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ProjectWithTasks } from "@/types/project";

/**
 * Aviso cuando un proyecto se acerca al tamano en el que las vistas dejan de
 * responder dentro del presupuesto.
 *
 * Las vistas piden el proyecto **entero** en cada carga: el cliente no manda
 * `page` ni `limit`. Medido en la Fase 4.5 con arboles de 5 niveles, el listado
 * sin filtro tarda 41 ms con 500 tareas, 89 ms con 2.000, 215 ms con 5.000,
 * 469 ms con 10.000 y 1.547 ms con 50.000: el presupuesto de 300 ms se cruza en
 * torno a las 6.500.
 *
 * Paginar de verdad es trabajo de interfaz que toca las cinco vistas y cambia
 * lo que la gente ve, asi que se aplazo a conciencia. Esto es la otra mitad de
 * esa decision: que el limite avise solo en vez de descubrirse como lentitud.
 */
const WARN_ABOVE = 5_000;

export function ProjectSizeWarning({
  project,
}: {
  project: ProjectWithTasks | undefined;
}) {
  const { t } = useTranslation();

  if (!project) return null;

  const count =
    project.columns.reduce((total, column) => total + column.tasks.length, 0) +
    project.archivedTasks.length +
    project.plannedTasks.length;

  if (count <= WARN_ABOVE) return null;

  return (
    <div className="flex items-start gap-2 border-b border-border bg-muted/60 px-4 py-2 text-xs text-muted-foreground">
      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
      <span>{t("tasks:projectSize.warning", { count })}</span>
    </div>
  );
}

export default ProjectSizeWarning;
