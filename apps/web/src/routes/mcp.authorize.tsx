import {
  createFileRoute,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { z } from "zod/v4";
import { AuthLayout } from "@/components/auth/layout";
import { Button } from "@/components/ui/button";
import { useMcpAuthorizationDecision } from "@/hooks/mutations/mcp/use-authorization-decision";
import { useMcpAuthorizationRequest } from "@/hooks/queries/mcp/use-authorization-request";
import { authClient } from "@/lib/auth-client";

const authorizationSearchSchema = z.object({
  request_id: z.string().optional(),
});

export const Route = createFileRoute("/mcp/authorize")({
  component: McpAuthorizePage,
  validateSearch: authorizationSearchSchema,
});

function McpAuthorizePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const search = useSearch({ from: "/mcp/authorize" });
  const requestId = search.request_id ?? "";
  const request = useMcpAuthorizationRequest(requestId);
  const decision = useMcpAuthorizationDecision();
  const { data: session, isPending: isSessionPending } =
    authClient.useSession();

  if (!requestId || request.isError) {
    return (
      <AuthLayout
        title={t("auth:mcp.failedTitle")}
        subtitle={t("auth:mcp.failedSubtitle")}
      >
        <p className="text-sm text-muted-foreground">
          {t("auth:mcp.failedHint")}
        </p>
      </AuthLayout>
    );
  }

  if (request.isLoading || isSessionPending) {
    return (
      <AuthLayout
        title={t("auth:mcp.title")}
        subtitle={t("auth:mcp.loadingSubtitle")}
      >
        <p className="text-sm text-muted-foreground">
          {t("auth:mcp.loadingBody")}
        </p>
      </AuthLayout>
    );
  }

  if (!session?.user) {
    const redirectTarget = `/mcp/authorize?request_id=${encodeURIComponent(requestId)}`;
    return (
      <AuthLayout
        title={t("auth:mcp.signInTitle")}
        subtitle={t("auth:mcp.signInSubtitle")}
      >
        <Button
          type="button"
          className="w-full"
          onClick={() =>
            void navigate({
              to: "/auth/sign-in",
              search: { redirect: redirectTarget },
            })
          }
        >
          {t("auth:mcp.signIn")}
        </Button>
      </AuthLayout>
    );
  }

  const submitDecision = (approved: boolean) => {
    decision.mutate(
      { requestId, approved },
      {
        onSuccess: (redirect) => window.location.assign(redirect),
      },
    );
  };

  return (
    <AuthLayout
      title={t("auth:mcp.title")}
      subtitle={t("auth:mcp.reviewSubtitle")}
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">{t("auth:mcp.warning")}</p>
        <div className="space-y-3 rounded-md border bg-muted/40 p-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              {t("auth:mcp.clientName")}
            </p>
            <p className="mt-1 text-sm">
              {request.data?.clientName ?? t("auth:mcp.defaultClient")}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              {t("auth:mcp.redirectUri")}
            </p>
            <p className="mt-1 break-all font-mono text-xs">
              {request.data?.redirectUri}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            className="flex-1"
            loading={decision.isPending && decision.variables?.approved}
            disabled={decision.isPending}
            onClick={() => submitDecision(true)}
          >
            {t("auth:mcp.approve")}
          </Button>
          <Button
            type="button"
            variant="outline"
            loading={decision.isPending && !decision.variables?.approved}
            disabled={decision.isPending}
            onClick={() => submitDecision(false)}
          >
            {t("auth:mcp.deny")}
          </Button>
        </div>
      </div>
    </AuthLayout>
  );
}
