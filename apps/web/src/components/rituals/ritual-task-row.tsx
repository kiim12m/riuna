import type { ReactNode } from "react";
import { ProjectPill } from "@/components/task/project-pill";
import { cn } from "@/lib/cn";
import { getPriorityIcon } from "@/lib/priority";

/**
 * Una tarea dentro de un ritual: titulo, proyecto y, a la derecha, lo que
 * pida el paso. Mas sencilla que la fila de Hoy: aqui no se abre ni se
 * arrastra, solo se decide. Un `div` y no un `li`: el menu de acciones la
 * envuelve en otro elemento, que no puede ir entre una lista y sus filas.
 */
export function RitualTaskRow({
  title,
  priority,
  projectName,
  projectIcon,
  leading,
  trailing,
  testId,
  muted = false,
}: {
  title: string;
  priority?: string;
  projectName: string;
  projectIcon: string | null;
  leading?: ReactNode;
  trailing?: ReactNode;
  testId?: string;
  muted?: boolean;
}) {
  return (
    <div
      data-testid={testId}
      className="flex flex-wrap items-center gap-2 rounded-md border border-border/70 px-2.5 py-2"
    >
      {leading}
      {priority && (
        <span className="shrink-0">{getPriorityIcon(priority)}</span>
      )}
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-body",
          muted && "text-muted-foreground",
        )}
      >
        {title}
      </span>
      <ProjectPill
        name={projectName}
        icon={projectIcon}
        className="hidden sm:inline-flex"
      />
      {trailing && (
        <div className="flex shrink-0 items-center gap-1">{trailing}</div>
      )}
    </div>
  );
}
