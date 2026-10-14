import {
  Calendar,
  CalendarClock,
  CalendarDays,
  CalendarX,
  Plus,
  Tag,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import labelColors from "@/constants/label-colors";
import { shortcuts } from "@/constants/shortcuts";
import { useGetColumns } from "@/hooks/queries/column/use-get-columns";
import useGetLabelsByTask from "@/hooks/queries/label/use-get-labels-by-task";
import useGetTask from "@/hooks/queries/task/use-get-task";
import { useGetActiveWorkspaceUsers } from "@/hooks/queries/workspace-users/use-get-active-workspace-users";
import { useRegisterShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { cn } from "@/lib/cn";
import { getColumnIcon } from "@/lib/column";
import {
  dueDateStatusColors,
  getDueDateStatus,
  isTaskCompleted,
} from "@/lib/due-date-status";
import { formatDateShort } from "@/lib/format";
import { getInitials } from "@/lib/get-initials";
import { getPriorityLabel, getStatusDisplayLabel } from "@/lib/i18n/domain";
import { getPriorityIcon } from "@/lib/priority";
import TaskActions from "./task-actions";
import TaskAssigneePopover from "./task-assignee-popover";
import TaskCustomFields from "./task-custom-fields";
import TaskCyclePopover, { TaskCycleTrigger } from "./task-cycle-popover";
import TaskDueDatePopover from "./task-due-date-popover";
import TaskEpicsPopover, { TaskEpicsTrigger } from "./task-epics-popover";
import TaskLabelsPopover from "./task-labels-popover";
import TaskPriorityPopover from "./task-priority-popover";
import TaskScheduleProperty from "./task-schedule-property";
import TaskStartDatePopover from "./task-start-date-popover";
import TaskStatusPopover from "./task-status-popover";
import TaskTeamPopover from "./task-team-popover";

const dueDateIcons = {
  overdue: CalendarX,
  "due-soon": CalendarClock,
  "far-future": Calendar,
  "no-due-date": Calendar,
} as const;

type TaskPropertiesSidebarProps = {
  taskId: string | undefined;
  projectId: string;
  workspaceId: string;
  className?: string;
  compact?: boolean;
};

type PropertyKey = "status" | "priority" | "assignee" | "labels" | "dueDate";
type SidebarLayout = "compact" | "mobile" | "desktop";

/**
 * Las propiedades de una tarea en tres disposiciones: `compact`, la barra de
 * chips del cajon; `mobile`, la misma barra en la pagina completa por debajo
 * de `lg`; y `desktop`, la columna derecha de la pagina completa. Las tres
 * salen de `renderProperties`, para que una propiedad nueva no aparezca en
 * una sola de ellas. La barra no lleva las acciones (`TaskActions`): le
 * comian la mitad del ancho, asi que van en la cabecera del cajon o de la
 * pagina.
 *
 * Los campos personalizados solo van en la columna: en la barra estiraban la
 * fila hasta la altura de todos los campos, asi que ahi los pinta el cuerpo
 * de la tarea (`TaskDetailsContent`, `showCustomFields`).
 */
export default function TaskPropertiesSidebar({
  taskId,
  projectId,
  workspaceId,
  className,
  compact = false,
}: TaskPropertiesSidebarProps) {
  const { t } = useTranslation();
  const { data: task } = useGetTask(taskId ?? "");
  const { data: columns = [] } = useGetColumns(projectId);
  const taskIsCompleted = isTaskCompleted(task?.status ?? "", columns);
  const { data: workspaceUsers } = useGetActiveWorkspaceUsers(workspaceId);
  const { data: taskLabels = [] } = useGetLabelsByTask(taskId ?? "");
  const statusColumn = columns.find(
    (column) => column.slug === task?.status || column.id === task?.status,
  );
  const statusLabel = getStatusDisplayLabel(
    task?.status ?? "",
    statusColumn?.name,
  );
  const statusIsFinal = statusColumn?.isFinal ?? false;
  const statusIcon = statusColumn?.icon;

  const assignee = workspaceUsers?.members?.find(
    (member) => member.userId === task?.userId,
  );

  // Los atajos del detalle -`s` estado, `p` prioridad, `a` asignado, `l`
  // etiquetas, `d` vencimiento- abren el selector correspondiente. Fuera del
  // modo compacto el lateral monta a la vez su disposicion movil y la de
  // escritorio -una oculta por CSS-, asi que solo se gobierna el selector de
  // la que se ve: abrir el de la oculta lo anclaria a un elemento invisible.
  const { canUpdateTasks } = useWorkspacePermission();
  const canEdit = canUpdateTasks();
  const isWide = useMediaQuery("(min-width: 1024px)");
  const activeLayout: SidebarLayout = compact
    ? "compact"
    : isWide
      ? "desktop"
      : "mobile";
  const [openProperty, setOpenProperty] = useState<PropertyKey | null>(null);
  const control = (key: PropertyKey, layout: SidebarLayout) =>
    layout === activeLayout
      ? {
          open: openProperty === key,
          onOpenChange: (open: boolean) => setOpenProperty(open ? key : null),
        }
      : {};

  // Memorizado: `useRegisterShortcuts` vuelve a registrar en cuanto cambia
  // el objeto, y cada registro re-renderiza a quien usa el proveedor.
  const propertyShortcuts = useMemo(
    (): { shortcuts: Record<string, () => void> } => ({
      shortcuts: canEdit
        ? {
            [shortcuts.taskDetails.status]: () => setOpenProperty("status"),
            [shortcuts.taskDetails.priority]: () => setOpenProperty("priority"),
            [shortcuts.taskDetails.assignee]: () => setOpenProperty("assignee"),
            [shortcuts.taskDetails.labels]: () => setOpenProperty("labels"),
            [shortcuts.taskDetails.dueDate]: () => setOpenProperty("dueDate"),
          }
        : {},
    }),
    [canEdit],
  );
  useRegisterShortcuts(propertyShortcuts);

  // Con varios asignados el nombre del principal se queda corto, asi que la
  // etiqueta pasa a contarlos. El avatar sigue siendo el del principal.
  const assigneeCount = task?.assignees?.length ?? (task?.userId ? 1 : 0);
  const assigneeLabel =
    assigneeCount > 1
      ? // `total` y no `count`: pasar `count` activaria la resolucion de
        // plurales de i18next y buscaria claves que no existen.
        t("tasks:popover.assignee.multiple", { total: assigneeCount })
      : assignee?.user?.name ||
        task?.assigneeName ||
        t("tasks:popover.assignee.unassigned");

  // Funciones y no componentes: un componente declarado aqui dentro se
  // volveria a montar en cada render y cerraria el selector abierto.
  const renderProperties = (layout: SidebarLayout) => {
    if (!task) return null;
    const desktop = layout === "desktop";
    const buttonClass = cn(
      "justify-start h-7 px-1.5 gap-1.5",
      desktop && "w-full",
    );
    const dueStatus = getDueDateStatus(task.dueDate, taskIsCompleted);
    const DueIcon = dueDateIcons[dueStatus];

    return (
      <>
        <TaskStatusPopover task={task} {...control("status", layout)}>
          <Button variant="ghost" size="sm" className={buttonClass}>
            {getColumnIcon(task.status ?? "", statusIsFinal, statusIcon)}
            <span className="text-xs font-semibold truncate">
              {statusLabel}
            </span>
          </Button>
        </TaskStatusPopover>
        <TaskPriorityPopover task={task} {...control("priority", layout)}>
          <Button variant="ghost" size="sm" className={buttonClass}>
            {getPriorityIcon(task.priority ?? "")}
            <span className="text-xs font-semibold truncate">
              {getPriorityLabel(task.priority ?? "")}
            </span>
          </Button>
        </TaskPriorityPopover>
        <TaskAssigneePopover
          task={task}
          workspaceId={workspaceId}
          {...control("assignee", layout)}
        >
          <Button variant="ghost" size="sm" className={buttonClass}>
            {task.userId ? (
              <Avatar className="h-[16px] w-[16px]">
                <AvatarImage
                  src={assignee?.user?.image ?? ""}
                  alt={assignee?.user?.name || ""}
                />
                <AvatarFallback className="text-label font-medium border border-border/30 shrink-0 h-[16px] w-[16px]">
                  {getInitials(assignee?.user?.name || task.assigneeName)}
                </AvatarFallback>
              </Avatar>
            ) : (
              <div
                className="w-[16px] h-[16px] rounded-full bg-muted border border-border flex items-center justify-center shrink-0"
                title={t("tasks:popover.assignee.unassigned")}
              >
                <span className="text-label font-medium">?</span>
              </div>
            )}
            <span className="text-xs font-semibold truncate max-w-[100px]">
              {assigneeLabel}
            </span>
          </Button>
        </TaskAssigneePopover>
        <TaskTeamPopover task={task} workspaceId={workspaceId}>
          <Button variant="ghost" size="sm" className={buttonClass}>
            <div className="w-[16px] h-[16px] rounded-full bg-muted border border-border flex items-center justify-center shrink-0">
              <Users className="w-2.5 h-2.5 text-muted-foreground" />
            </div>
            <span className="text-xs font-semibold truncate max-w-[100px]">
              {task.teamName || t("tasks:popover.team.unassigned")}
            </span>
          </Button>
        </TaskTeamPopover>
        <TaskCyclePopover task={task} projectId={projectId}>
          <TaskCycleTrigger task={task} projectId={projectId} />
        </TaskCyclePopover>
        <TaskEpicsPopover task={task} projectId={projectId}>
          <TaskEpicsTrigger task={task} />
        </TaskEpicsPopover>
        {desktop && (
          <TaskCustomFields
            task={task}
            projectId={projectId}
            workspaceId={workspaceId}
          />
        )}
        {!task.isMilestone && (
          <TaskStartDatePopover task={task}>
            <Button variant="ghost" size="sm" className={buttonClass}>
              <CalendarDays className="w-3.5 h-3.5 text-muted-foreground" />
              <span
                className={`text-xs font-semibold ${task.startDate ? "" : "text-muted-foreground"}`}
              >
                {task.startDate
                  ? formatDateShort(task.startDate)
                  : desktop
                    ? t("tasks:properties.startDate")
                    : t("tasks:properties.start")}
              </span>
            </Button>
          </TaskStartDatePopover>
        )}
        <TaskDueDatePopover task={task} {...control("dueDate", layout)}>
          <Button variant="ghost" size="sm" className={buttonClass}>
            {task.dueDate ? (
              <>
                <DueIcon
                  className={`w-3.5 h-3.5 ${dueDateStatusColors[dueStatus]}`}
                />
                <span className="text-xs font-semibold">
                  {formatDateShort(task.dueDate)}
                </span>
              </>
            ) : (
              <>
                <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground">
                  {t("tasks:properties.noDate")}
                </span>
              </>
            )}
          </Button>
        </TaskDueDatePopover>
        <TaskScheduleProperty task={task} />
      </>
    );
  };

  // Cada etiqueta abre el selector; el `+`, o el chip vacio en la barra, es
  // el que gobierna el atajo `l`.
  const renderLabelBadges = () =>
    task &&
    taskLabels.map((label: { id: string; name: string; color: string }) => (
      <TaskLabelsPopover
        key={`edit-${label.id}`}
        task={task}
        workspaceId={workspaceId}
        triggerNativeButton={false}
      >
        <Badge
          variant="outline"
          className="flex items-center gap-1 px-1.5 py-0.5 cursor-pointer hover:bg-accent/50 transition-colors text-label"
        >
          <span
            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{
              backgroundColor:
                labelColors.find((c) => c.value === label.color)?.color ||
                "var(--color-neutral-400)",
            }}
          />
          <span className="truncate max-w-[60px]">{label.name}</span>
        </Badge>
      </TaskLabelsPopover>
    ));

  const renderAddLabel = (layout: SidebarLayout) =>
    task && (
      <TaskLabelsPopover
        task={task}
        workspaceId={workspaceId}
        {...control("labels", layout)}
      >
        <Button
          variant="ghost"
          size="sm"
          className="h-5 w-5 p-0 rounded-full"
          aria-label={t("tasks:properties.labels")}
        >
          <Plus className="h-3 w-3" />
        </Button>
      </TaskLabelsPopover>
    );

  const renderLabelsChip = (layout: SidebarLayout) => {
    if (!task) return null;
    if (taskLabels.length === 0) {
      return (
        <TaskLabelsPopover
          task={task}
          workspaceId={workspaceId}
          {...control("labels", layout)}
        >
          <Button
            variant="ghost"
            size="sm"
            className="justify-start h-7 px-1.5 gap-1.5"
          >
            <Tag className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold text-muted-foreground">
              {t("tasks:properties.labels")}
            </span>
          </Button>
        </TaskLabelsPopover>
      );
    }
    return (
      <div className="flex flex-wrap items-center gap-1.5 min-h-7 px-1.5">
        <Tag className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        {renderLabelBadges()}
        {renderAddLabel(layout)}
      </div>
    );
  };

  const renderBar = (layout: "compact" | "mobile") => (
    <div className="flex w-full min-w-0 flex-row flex-wrap items-center gap-1 px-2.5 py-2">
      {renderProperties(layout)}
      {renderLabelsChip(layout)}
    </div>
  );

  return (
    <div className={className}>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
        {compact && renderBar("compact")}

        {!compact && (
          <>
            <div className="lg:hidden">{renderBar("mobile")}</div>

            {/* Desktop: Title + stacked properties */}
            <div className="hidden lg:block">
              <div className="flex items-center justify-between px-3 py-2">
                <p className="text-sm font-medium text-foreground/70 flex-1">
                  {t("tasks:properties.title")}
                </p>
                {taskId && (
                  <TaskActions
                    taskId={taskId}
                    projectId={projectId}
                    workspaceId={workspaceId}
                    iconOnly
                  />
                )}
              </div>

              <div className="flex flex-col gap-2 px-3 py-3">
                {renderProperties("desktop")}
              </div>

              <div className="flex px-3 flex-col gap-3 p-2">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-foreground/70 px-2">
                    {t("tasks:properties.labels")}
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5 px-2">
                    {renderLabelBadges()}
                    {renderAddLabel("desktop")}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
