import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import WorkspaceLayout from "@/components/common/workspace-layout";
import { MyWorkFilters } from "@/components/my-work/my-work-filters";
import { MyWorkInbox } from "@/components/my-work/my-work-inbox";
import { MyWorkTaskList } from "@/components/my-work/my-work-task-list";
import PageTitle from "@/components/page-title";
import { Tabs, TabsList, TabsPanel, TabsTrigger } from "@/components/ui/tabs";
import type { MyWorkDueWindow } from "@/fetchers/my-work/get-my-work";

type MyWorkSearch = {
  tab: "tasks" | "inbox";
  due: MyWorkDueWindow;
  done?: true;
  projectId?: string;
};

const DUE_WINDOWS: MyWorkDueWindow[] = ["all", "overdue", "today", "week"];

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/my-work",
)({
  // Validado a mano, como `board.tsx` y `table.tsx`. Los filtros viven en la URL
  // porque una vista filtrada es, al final, un enlace (ADR 015); el numero de
  // pagina no, que es ruido en la barra de direcciones.
  validateSearch: (search: Record<string, unknown>): MyWorkSearch => ({
    tab: search.tab === "inbox" ? "inbox" : "tasks",
    due: DUE_WINDOWS.includes(search.due as MyWorkDueWindow)
      ? (search.due as MyWorkDueWindow)
      : "all",
    done: search.done === true ? true : undefined,
    projectId:
      typeof search.projectId === "string" ? search.projectId : undefined,
  }),
  component: MyWorkComponent,
});

function MyWorkComponent() {
  const { t } = useTranslation();
  const { workspaceId } = Route.useParams();
  const { tab, due, done, projectId } = Route.useSearch();
  const navigate = useNavigate();

  function updateSearch(next: Partial<MyWorkSearch>) {
    navigate({
      to: ".",
      search: (previous: MyWorkSearch) => ({ ...previous, ...next }),
      replace: true,
    });
  }

  const filters = {
    includeDone: done === true,
    due,
    projectId,
  };

  return (
    <>
      <PageTitle title={t("myWork:pageTitle")} />
      <WorkspaceLayout title={t("myWork:pageTitle")}>
        <Tabs
          value={tab}
          onValueChange={(value) =>
            updateSearch({ tab: value === "inbox" ? "inbox" : "tasks" })
          }
        >
          <TabsList>
            <TabsTrigger value="tasks">{t("myWork:tabs.tasks")}</TabsTrigger>
            <TabsTrigger value="inbox">{t("myWork:tabs.inbox")}</TabsTrigger>
          </TabsList>

          <TabsPanel value="tasks" className="space-y-6 pt-4">
            <MyWorkFilters
              workspaceId={workspaceId}
              due={due}
              includeDone={done === true}
              projectId={projectId}
              // `done: false` se traduce a ausente: la URL solo lleva el filtro
              // cuando esta puesto, y asi el enlace por defecto es limpio.
              onChange={(next) =>
                updateSearch({
                  ...(next.due !== undefined ? { due: next.due } : {}),
                  ...("done" in next
                    ? { done: next.done ? true : undefined }
                    : {}),
                  ...("projectId" in next ? { projectId: next.projectId } : {}),
                })
              }
            />
            <MyWorkTaskList
              workspaceId={workspaceId}
              scope="assigned"
              filters={filters}
            />
            <MyWorkTaskList
              workspaceId={workspaceId}
              scope="team"
              filters={filters}
            />
          </TabsPanel>

          <TabsPanel value="inbox" className="pt-4">
            <MyWorkInbox />
          </TabsPanel>
        </Tabs>
      </WorkspaceLayout>
    </>
  );
}
