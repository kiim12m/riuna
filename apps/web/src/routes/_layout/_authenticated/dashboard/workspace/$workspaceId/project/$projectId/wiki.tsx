import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import ProjectLayout from "@/components/common/project-layout";
import PageTitle from "@/components/page-title";
import { WikiView } from "@/components/wiki/wiki-view";
import useGetProject from "@/hooks/queries/project/use-get-project";

type WikiSearchParams = { page?: string };

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/project/$projectId/wiki",
)({
  component: RouteComponent,
  validateSearch: (search: Record<string, unknown>): WikiSearchParams => ({
    page: typeof search.page === "string" ? search.page : undefined,
  }),
});

/** La wiki del proyecto, con las paginas del espacio al lado (ADR 092). */
function RouteComponent() {
  const { t } = useTranslation();
  const { workspaceId, projectId } = Route.useParams();
  const { page } = Route.useSearch();
  const navigate = useNavigate();
  const { data: project } = useGetProject({ id: projectId, workspaceId });

  const openPage = useCallback(
    (pageId: string | undefined) =>
      navigate({
        to: ".",
        search: { page: pageId },
        // Abrir la primera pagina sola no deja un paso que deshacer.
        replace: !page,
      }),
    [navigate, page],
  );

  return (
    <ProjectLayout
      projectId={projectId}
      workspaceId={workspaceId}
      activeView="wiki"
    >
      <PageTitle title={t("wiki:pageTitle", { name: project?.name ?? "" })} />
      <div className="h-full min-h-0 overflow-hidden bg-card">
        <WikiView
          workspaceId={workspaceId}
          projectId={projectId}
          projectName={project?.name}
          pageId={page}
          onOpenPage={openPage}
        />
      </div>
    </ProjectLayout>
  );
}
