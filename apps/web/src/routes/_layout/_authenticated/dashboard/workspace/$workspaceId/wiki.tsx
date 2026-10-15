import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import WorkspaceLayout from "@/components/common/workspace-layout";
import PageTitle from "@/components/page-title";
import { WikiView } from "@/components/wiki/wiki-view";

type WikiSearchParams = { page?: string };

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/wiki",
)({
  component: WorkspaceWiki,
  validateSearch: (search: Record<string, unknown>): WikiSearchParams => ({
    page: typeof search.page === "string" ? search.page : undefined,
  }),
});

/**
 * La wiki del espacio, sola (ADR 092). No tiene entrada en la barra: se llega
 * desde la busqueda, la paleta, un aviso o un enlace; la de cada proyecto ya
 * la ensena en su grupo «Espacio».
 */
function WorkspaceWiki() {
  const { t } = useTranslation();
  const { workspaceId } = Route.useParams();
  const { page } = Route.useSearch();
  const navigate = useNavigate();

  const openPage = useCallback(
    (pageId: string | undefined) =>
      navigate({ to: ".", search: { page: pageId }, replace: !page }),
    [navigate, page],
  );

  return (
    <>
      <PageTitle title={t("wiki:workspaceTitle")} />
      <WorkspaceLayout title={t("wiki:workspaceTitle")}>
        <div className="h-full min-h-0 overflow-hidden rounded-md border border-border/80 bg-card">
          <WikiView
            workspaceId={workspaceId}
            projectId={null}
            pageId={page}
            onOpenPage={openPage}
          />
        </div>
      </WorkspaceLayout>
    </>
  );
}
