import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogPanel,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useGetWidgetTasks } from "@/hooks/queries/dashboard/use-dashboards";
import { WidgetTaskRow } from "./widget-task-row";

/**
 * Las tareas que hay detras de una cifra del panel (ADR 090).
 *
 * La lista la calcula el servidor con los mismos predicados que la tarjeta, asi
 * que su longitud es la cifra: aqui no se vuelve a filtrar nada. Las filas son
 * las de la tabla del panel, y abrir una lleva al cajon de la tarea igual que
 * desde cualquier otro widget.
 */
export function WidgetTasksDialog({
  widgetId,
  title,
  open,
  onOpenChange,
  onOpenTask,
}: {
  widgetId: string;
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenTask: (projectId: string, taskId: string) => void;
}) {
  const { t } = useTranslation();
  const query = useGetWidgetTasks(widgetId, open);
  const tasks = query.data?.pages.flatMap((page) => page.tasks) ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <DialogPanel className="space-y-3">
          {query.isPending ? (
            <Skeleton className="h-24 w-full rounded-md" />
          ) : query.isError ? (
            <p className="text-muted-foreground text-meta">
              {t("panels:widgetTasks.error")}
            </p>
          ) : tasks.length === 0 ? (
            // La cifra puede haber cambiado entre que se pinto y se abrio la
            // lista: el panel se recalcula cada minuto, no al instante.
            <p className="text-muted-foreground text-meta">
              {t("panels:widgetTasks.empty")}
            </p>
          ) : (
            <ul className="flex flex-col gap-(--density-gap)">
              {tasks.map((task) => (
                <li key={task.id}>
                  <WidgetTaskRow
                    task={task}
                    onOpen={() => onOpenTask(task.projectId, task.id)}
                  />
                </li>
              ))}
            </ul>
          )}

          {query.hasNextPage && (
            <Button
              variant="outline"
              size="sm"
              disabled={query.isFetchingNextPage}
              onClick={() => query.fetchNextPage()}
            >
              {t("panels:widgetTasks.loadMore")}
            </Button>
          )}
        </DialogPanel>
      </DialogContent>
    </Dialog>
  );
}
