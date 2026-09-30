import { Layout } from "lucide-react";
import projectIcons from "@/constants/project-icons";
import { cn } from "@/lib/cn";

/**
 * El proyecto de una tarea en una lista que cruza proyectos (Hoy, Mis tareas,
 * los widgets de Mi panel): una pildora con borde en vez de icono y texto
 * sueltos, para que no se confunda con el titulo a su izquierda.
 */
export function ProjectPill({
  name,
  icon,
  className,
}: {
  name: string;
  icon?: string | null;
  className?: string;
}) {
  const ProjectIcon = projectIcons[icon as keyof typeof projectIcons] ?? Layout;

  return (
    <span
      className={cn(
        "inline-flex min-w-0 shrink-0 items-center gap-1 rounded-full border border-border px-1.5 py-px text-meta text-muted-foreground",
        className,
      )}
    >
      <ProjectIcon className="size-3 shrink-0" />
      <span className="max-w-28 truncate">{name}</span>
    </span>
  );
}
