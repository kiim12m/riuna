import { ChevronLeft, ChevronRight, Inbox, Users } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import type { MyWorkParams, MyWorkScope } from "@/fetchers/my-work/get-my-work";
import { useGetMyWork } from "@/hooks/queries/my-work/use-get-my-work";
import { MyWorkTaskRow } from "./my-work-task-row";

type Props = {
  workspaceId: string;
  scope: MyWorkScope;
  filters: Pick<MyWorkParams, "includeDone" | "due" | "projectId">;
};

const PAGE_SIZE = 25;

export function MyWorkTaskList({ workspaceId, scope, filters }: Props) {
  const { t } = useTranslation();
  const { includeDone, due, projectId } = filters;

  // El numero de pagina vive en estado local y no en la URL: nadie enlaza a la
  // pagina 2 de su propia lista, y dos secciones con su propio numero en la
  // barra de direcciones solo la ensucian.
  //
  // Cambiar un filtro tiene que volver a la primera pagina, o te quedas mirando
  // una que ya no existe. Se ajusta **durante el render** guardando junto al
  // numero la firma de los filtros con la que se eligio, que es el patron que
  // React recomienda para esto. Con un efecto habria un render intermedio con
  // la pagina vieja y los filtros nuevos: una peticion de mas y un parpadeo.
  const filterSignature = `${includeDone ?? false}|${due ?? "all"}|${projectId ?? ""}`;
  const [pageState, setPageState] = useState({
    page: 1,
    signature: filterSignature,
  });
  const page = pageState.signature === filterSignature ? pageState.page : 1;

  const setPage = (next: number) =>
    setPageState({ page: next, signature: filterSignature });

  const { data, isPending, isError } = useGetMyWork({
    workspaceId,
    scope,
    includeDone,
    due,
    projectId,
    page,
    limit: PAGE_SIZE,
  });

  const tasks = data?.tasks ?? [];
  const hasMore = data?.pagination.hasMore ?? false;

  return (
    <section className="space-y-2">
      <header className="flex items-center gap-2">
        <h2 className="font-medium text-sm">
          {t(`myWork:sections.${scope}.title`)}
        </h2>
        {tasks.length > 0 && (
          <span className="text-muted-foreground text-xs">
            {t("myWork:count", { count: tasks.length })}
          </span>
        )}
      </header>

      {isPending ? (
        <div className="space-y-2">
          {["a", "b", "c", "d", "e"].map((key) => (
            <Skeleton key={key} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <p className="py-6 text-center text-muted-foreground text-sm">
          {t("myWork:error")}
        </p>
      ) : tasks.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              {scope === "assigned" ? <Inbox /> : <Users />}
            </EmptyMedia>
            <EmptyTitle>{t(`myWork:sections.${scope}.empty.title`)}</EmptyTitle>
            <EmptyDescription>
              {t(`myWork:sections.${scope}.empty.description`)}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-1.5">
          {tasks.map((task) => (
            <MyWorkTaskRow
              key={task.id}
              task={task}
              workspaceId={workspaceId}
              showTeam={scope === "team"}
            />
          ))}
        </div>
      )}

      {(page > 1 || hasMore) && (
        <div className="flex items-center justify-end gap-1 pt-1">
          <Button
            variant="ghost"
            size="sm"
            disabled={page === 1}
            onClick={() => setPage(Math.max(1, page - 1))}
          >
            <ChevronLeft className="h-4 w-4" />
            {t("common:actions.previous")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={!hasMore}
            onClick={() => setPage(page + 1)}
          >
            {t("common:actions.next")}
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </section>
  );
}
