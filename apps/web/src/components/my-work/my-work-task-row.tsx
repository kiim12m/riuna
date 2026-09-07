import { useNavigate } from "@tanstack/react-router";
import { Layout } from "lucide-react";
import { TaskLabels } from "@/components/kanban-board/task-labels";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import projectIcons from "@/constants/project-icons";
import type { MyWorkTask } from "@/fetchers/my-work/get-my-work";
import { cn } from "@/lib/cn";
import { getColumnIcon } from "@/lib/column";
import { dueDateStatusColors, getDueDateStatus } from "@/lib/due-date-status";
import { formatRelativeTime } from "@/lib/format";
import { getInitials } from "@/lib/get-initials";
import { getPriorityIcon } from "@/lib/priority";

/**
 * La fila de "Mi trabajo".
 *
 * No reutiliza `components/list-view/task-row.tsx` a proposito: aquella exige
 * un `DndContext` ancestro para `useSortable`, lee `useProjectStore()` —un
 * proyecto activo **unico**, que aqui es incorrecto por construccion— y arrastra
 * el menu contextual y el store de seleccion multiple, los dos atados a un
 * `projectId`. Lo que si se reutiliza son los primitivos: iconos de prioridad y
 * de columna, el estado de vencimiento, las etiquetas y el avatar.
 */
export function MyWorkTaskRow({
  task,
  workspaceId,
  showTeam = false,
}: {
  task: MyWorkTask;
  workspaceId: string;
  showTeam?: boolean;
}) {
  const navigate = useNavigate();

  // El servidor ya ha resuelto "hecho" contra la columna final del proyecto de
  // cada fila. `isTaskCompleted` no sirve aqui: necesita las columnas de un
  // proyecto concreto, y esta lista mezcla varios.
  const dueStatus = getDueDateStatus(task.dueDate, task.isDone);
  const ProjectIcon =
    projectIcons[task.projectIcon as keyof typeof projectIcons] ?? Layout;

  return (
    <button
      type="button"
      onClick={() =>
        navigate({
          to: "/dashboard/workspace/$workspaceId/project/$projectId/task/$taskId",
          params: {
            workspaceId,
            projectId: task.projectId,
            taskId: task.id,
          },
        })
      }
      className="flex w-full items-center gap-3 rounded-lg border border-border bg-background px-3 py-2.5 text-left transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex-shrink-0 first:[&_svg]:h-4 first:[&_svg]:w-4">
        {getPriorityIcon(task.priority)}
      </span>

      <span className="hidden flex-shrink-0 font-mono text-muted-foreground text-xs sm:inline">
        {task.projectSlug}-{task.number}
      </span>

      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate text-sm",
            task.isDone
              ? "text-muted-foreground line-through"
              : "text-foreground",
          )}
        >
          {task.title}
        </span>
        {task.labels.length > 0 && (
          <span className="mt-1 flex">
            <TaskLabels labels={task.labels} />
          </span>
        )}
      </span>

      {/* El chip de proyecto es lo que hace legible una lista entre proyectos. */}
      <span className="hidden flex-shrink-0 items-center gap-1.5 rounded border border-border bg-muted/55 px-2 py-0.5 text-[10px] text-muted-foreground md:flex">
        <ProjectIcon className="h-3 w-3" />
        <span className="max-w-28 truncate">{task.projectName}</span>
      </span>

      {showTeam && task.teamName && (
        <span className="hidden max-w-28 flex-shrink-0 truncate rounded border border-border bg-muted/55 px-2 py-0.5 text-[10px] text-muted-foreground lg:inline">
          {task.teamName}
        </span>
      )}

      {task.statusColumn && (
        <span className="hidden flex-shrink-0 items-center gap-1 text-[10px] text-muted-foreground xl:flex">
          {getColumnIcon(
            task.statusColumn.slug,
            task.statusColumn.isFinal,
            task.statusColumn.icon,
          )}
          <span className="max-w-24 truncate">{task.statusColumn.name}</span>
        </span>
      )}

      {task.dueDate && (
        <span
          className={cn(
            "hidden flex-shrink-0 rounded px-2 py-0.5 text-[10px] sm:inline",
            dueDateStatusColors[dueStatus],
          )}
        >
          {formatRelativeTime(task.dueDate)}
        </span>
      )}

      <span className="-space-x-1.5 flex flex-shrink-0 items-center">
        {task.assignees.slice(0, 3).map((assignee) => (
          <Avatar key={assignee.id} className="h-5 w-5 ring-2 ring-background">
            <AvatarImage src={assignee.image ?? undefined} />
            <AvatarFallback className="text-[9px]">
              {getInitials(assignee.name)}
            </AvatarFallback>
          </Avatar>
        ))}
      </span>
    </button>
  );
}
