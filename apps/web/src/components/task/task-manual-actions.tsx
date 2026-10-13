import { Zap } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import { useRunManualAction } from "@/hooks/mutations/automation/use-run-manual-action";
import { useManualActions } from "@/hooks/queries/automation/use-manual-actions";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";

/**
 * Las acciones de un clic de la tarea (ADR 078): las reglas con «Cuando: se
 * pulsa el botón» cuyo «Si» cumple ahora. Corren en nombre de quien pulsa, así
 * que solo las ve quien puede editar tareas.
 */
function useTaskManualActions(taskId: string) {
  const { canUpdateTasks } = useWorkspacePermission();
  const canEdit = canUpdateTasks();
  const { data: actions = [] } = useManualActions(taskId, canEdit);
  const { mutate: run, isPending, variables } = useRunManualAction(taskId);

  const press = (automationId: string, name: string) =>
    run({ automationId, name });

  return {
    actions: canEdit ? actions : [],
    press,
    isPending,
    pressing: isPending ? variables?.automationId : undefined,
  };
}

export default function TaskManualActions({ taskId }: { taskId: string }) {
  const { t } = useTranslation();
  const { actions, press, isPending, pressing } = useTaskManualActions(taskId);

  if (actions.length === 0) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      data-testid="task-manual-actions"
    >
      {actions.map((action) => (
        <Button
          key={action.id}
          variant="outline"
          size="xs"
          className="gap-1 text-foreground"
          disabled={isPending}
          aria-busy={pressing === action.id}
          title={t("tasks:manualActions.hint")}
          onClick={() => press(action.id, action.name)}
        >
          <Zap className="size-3.5 text-brand-strong" />
          {action.name}
        </Button>
      ))}
    </div>
  );
}

/** Las mismas acciones en el menú contextual de la fila o la tarjeta. */
export function TaskManualActionsMenu({ taskId }: { taskId: string }) {
  const { t } = useTranslation();
  const { actions, press, isPending } = useTaskManualActions(taskId);

  if (actions.length === 0) return null;

  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger>
        <span>{t("tasks:manualActions.menu")}</span>
      </ContextMenuSubTrigger>
      <ContextMenuSubContent className="w-56">
        {actions.map((action) => (
          <ContextMenuItem
            key={action.id}
            className="gap-2"
            disabled={isPending}
            onClick={() => press(action.id, action.name)}
          >
            <Zap className="size-3.5 text-brand-strong" />
            <span className="truncate">{action.name}</span>
          </ContextMenuItem>
        ))}
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}
