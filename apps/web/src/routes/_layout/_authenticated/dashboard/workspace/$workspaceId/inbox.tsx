import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Inbox } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import WorkspaceLayout from "@/components/common/workspace-layout";
import PageTitle from "@/components/page-title";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { useEnsureInbox } from "@/hooks/mutations/capture/use-ensure-inbox";

/**
 * La puerta de la Bandeja (ADR 051): la crea si es la primera vez y lleva a
 * sus tareas. Es un proyecto como otro cualquiera, asi que no tiene pantalla
 * propia; lo que si tiene es una direccion fija para la barra lateral y la
 * paleta, que no saben su id hasta que existe.
 */
export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/inbox",
)({
  component: InboxRoute,
});

function InboxRoute() {
  const { t } = useTranslation();
  const { workspaceId } = Route.useParams();
  const navigate = useNavigate();
  const { mutate: ensureInbox, isError } = useEnsureInbox();

  useEffect(() => {
    ensureInbox(workspaceId, {
      onSuccess: (inbox) =>
        navigate({
          to: "/dashboard/workspace/$workspaceId/project/$projectId/board",
          params: { workspaceId, projectId: inbox.id },
          replace: true,
        }),
    });
  }, [workspaceId, ensureInbox, navigate]);

  return (
    <>
      <PageTitle title={t("navigation:sidebar.inbox")} />
      <WorkspaceLayout title={t("navigation:sidebar.inbox")}>
        {isError ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Inbox />
              </EmptyMedia>
              <EmptyTitle>{t("navigation:inbox.unavailableTitle")}</EmptyTitle>
              <EmptyDescription>
                {t("navigation:inbox.unavailableDescription")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="space-y-2 p-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        )}
      </WorkspaceLayout>
    </>
  );
}
