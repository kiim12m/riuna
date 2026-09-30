import { Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/components/providers/auth-provider/hooks/use-auth";
import CreateTaskModal from "@/components/shared/modals/create-task-modal";
import { Button } from "@/components/ui/button";
import { KbdSequence } from "@/components/ui/kbd";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { shortcuts } from "@/constants/shortcuts";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";

/**
 * «Nueva tarea» en la cabecera de cada pantalla: el mismo dialogo que abre
 * «t c» desde la paleta, pero a la vista, para apuntar algo en cualquier
 * momento sin salir de donde se esta. Fuera de un proyecto el dialogo ofrece
 * su selector de proyecto; dentro, toma el de la ruta.
 */
export function NewTaskButton({
  assignToMe = false,
}: {
  assignToMe?: boolean;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { canCreateTasks } = useWorkspacePermission();
  const [open, setOpen] = useState(false);

  // Comodidad, no autorizacion: `POST /task` exige `task:create` igual.
  if (!canCreateTasks()) return null;

  const label = t("common:modals.createTask.title");

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="xs"
              onClick={() => setOpen(true)}
              aria-label={label}
            >
              <Plus />
              <span className="hidden lg:inline">{label}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p className="flex items-center gap-2 text-meta">
              {label}
              <KbdSequence
                keys={[shortcuts.task.prefix, shortcuts.task.create]}
              />
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <CreateTaskModal
        open={open}
        onClose={() => setOpen(false)}
        defaultAssigneeId={assignToMe ? user?.id : undefined}
      />
    </>
  );
}
