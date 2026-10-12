import { createFileRoute } from "@tanstack/react-router";
import { Laptop, ShieldCheck, Smartphone } from "lucide-react";
import { useTranslation } from "react-i18next";
import PageTitle from "@/components/page-title";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardFrame,
  CardHeader,
  CardPanel,
  CardTitle,
} from "@/components/ui/card";
import type { ActiveSession } from "@/fetchers/session";
import { useRevokeSessions } from "@/hooks/mutations/session/use-revoke-sessions";
import { useMySessions } from "@/hooks/queries/session/use-my-sessions";
import { formatDateTime, formatRelativeTime } from "@/lib/format";
import { toast } from "@/lib/toast";
import { describeUserAgent } from "@/lib/user-agent";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/account/security",
)({
  component: RouteComponent,
});

function SessionRow({
  session,
  onRevoke,
  disabled,
}: {
  session: ActiveSession;
  onRevoke: () => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const device = describeUserAgent(session.userAgent);
  const Icon = device.kind === "phone" ? Smartphone : Laptop;
  const name =
    device.browser && device.os
      ? t("settings:securityPage.browserOn", {
          browser: device.browser,
          os: device.os,
        })
      : (device.browser ??
        device.os ??
        t("settings:securityPage.unknownDevice"));

  return (
    <li
      className="flex items-center gap-3 border-t border-border px-4 py-3 first:border-t-0"
      data-testid="session-row"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-md border border-border bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{name}</p>
        <p
          className="truncate text-xs text-muted-foreground"
          title={formatDateTime(session.createdAt)}
        >
          {[
            session.ipAddress,
            t("settings:securityPage.signedIn", {
              when: formatRelativeTime(session.createdAt),
            }),
            t("settings:securityPage.expires", {
              when: formatRelativeTime(session.expiresAt),
            }),
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {session.impersonated && (
          <p className="text-xs text-warning-foreground">
            {t("settings:securityPage.impersonated")}
          </p>
        )}
      </div>
      {session.current ? (
        <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-success-foreground">
          <span className="size-1.5 rounded-full bg-current" />
          {t("settings:securityPage.thisSession")}
        </span>
      ) : (
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={onRevoke}
        >
          {t("settings:securityPage.revoke")}
        </Button>
      )}
    </li>
  );
}

function RouteComponent() {
  const { t } = useTranslation();
  const { data: sessions = [], isLoading } = useMySessions();
  const { mutate: revoke, isPending } = useRevokeSessions();
  const others = sessions.filter((session) => !session.current).length;

  const close = (id: string | null) =>
    revoke(id, {
      onSuccess: ({ revoked }) =>
        toast.success(
          id
            ? t("settings:securityPage.revoked")
            : t("settings:securityPage.revokedOthers", { total: revoked }),
        ),
      onError: (error) =>
        toast.error(
          error instanceof Error
            ? error.message
            : t("settings:securityPage.revokeError"),
        ),
    });

  return (
    <>
      <PageTitle title={t("settings:securityPage.pageTitle")} />
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="space-y-2">
          <h1 className="text-page">{t("settings:securityPage.title")}</h1>
          <p className="text-muted-foreground">
            {t("settings:securityPage.subtitle")}
          </p>
        </div>

        <CardFrame>
          <Card className="!rounded-none !border-t-0">
            <CardHeader>
              <CardTitle className="inline-flex items-center gap-2 text-base">
                <ShieldCheck className="size-4" />
                {t("settings:securityPage.sessionsTitle")}
              </CardTitle>
              <CardDescription>
                {t("settings:securityPage.sessionsDescription")}
              </CardDescription>
            </CardHeader>
          </Card>
          <Card className="!rounded-none">
            <CardPanel className="p-0">
              {isLoading ? (
                <p className="px-4 py-3 text-sm text-muted-foreground">
                  {t("settings:securityPage.loading")}
                </p>
              ) : (
                <ul data-testid="session-list">
                  {sessions.map((session) => (
                    <SessionRow
                      key={session.id}
                      session={session}
                      disabled={isPending}
                      onRevoke={() => close(session.id)}
                    />
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-3">
                <Button
                  variant="destructive-outline"
                  size="sm"
                  disabled={isPending || others === 0}
                  onClick={() => close(null)}
                >
                  {t("settings:securityPage.revokeOthers")}
                </Button>
                <span className="text-xs text-muted-foreground">
                  {t("settings:securityPage.delayNote")}
                </span>
              </div>
            </CardPanel>
          </Card>
        </CardFrame>
      </div>
    </>
  );
}
