import { createFileRoute } from "@tanstack/react-router";
import { Copy, UsersRound } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PageHeading } from "@/components/common/page-heading";
import WorkspaceLayout from "@/components/common/workspace-layout";
import { TeamMemberCard } from "@/components/lead/team-member-card";
import PageTitle from "@/components/page-title";
import { parseDayKey } from "@/components/schedule/schedule-range";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { useTeamDay, useTeamStandup } from "@/hooks/queries/lead/use-team";
import { copyToClipboard } from "@/lib/copy-to-clipboard";
import { formatDate } from "@/lib/format";
import { type StandupLabels, standupMarkdown } from "@/lib/standup";
import { toast } from "@/lib/toast";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/team",
)({
  component: TeamRoute,
});

type Tab = "day" | "standup";

/**
 * «Mi equipo» (5.3, ADR 059): lo que el responsable de departamento lee de
 * su gente. **Solo lectura**: ninguna accion sobre el plan ajeno -para
 * cambiar algo se reasigna o se cambia el vencimiento, como siempre-. Sin
 * tiempo real: se relee cada minuto.
 */
function TeamRoute() {
  const { t } = useTranslation();
  const { workspaceId } = Route.useParams();
  const [tab, setTab] = useState<Tab>("day");
  const { data: day, isPending } = useTeamDay(workspaceId);
  const { data: standup } = useTeamStandup(workspaceId, tab === "standup");

  const labels: StandupLabels = {
    yesterday: t("rituals:standup.yesterday"),
    today: t("rituals:standup.today"),
    blockers: t("rituals:standup.blockers"),
    nothingDone: t("rituals:standup.nothingDone"),
    nothingPlanned: t("rituals:standup.nothingPlanned"),
    noBlockers: t("rituals:standup.noBlockers"),
    day: (key) =>
      formatDate(parseDayKey(key), {
        weekday: "short",
        day: "numeric",
        month: "short",
      }),
  };
  const sections = (standup?.members ?? []).map((member) => ({
    id: member.id,
    name: member.name,
    markdown: standupMarkdown(member.standup, labels),
  }));

  const copyAll = async () => {
    const text = sections
      .map((section) => `## ${section.name}\n\n${section.markdown}`)
      .join("\n\n");
    if (await copyToClipboard(text)) {
      toast.success(t("rituals:standup.copied"));
    } else {
      toast.error(t("rituals:standup.copyError"));
    }
  };

  const members = day?.members ?? [];

  return (
    <>
      <PageTitle title={t("lead:team.title")} />
      <WorkspaceLayout title={t("lead:team.title")}>
        <div className="space-y-4 p-4">
          <PageHeading
            title={t("lead:team.title")}
            description={t("lead:team.description")}
            actions={
              members.length > 0 && (
                <SegmentedControl
                  label={t("lead:team.view")}
                  value={tab}
                  onValueChange={setTab}
                  options={[
                    { value: "day", label: t("lead:team.tabs.day") },
                    { value: "standup", label: t("lead:team.tabs.standup") },
                  ]}
                />
              )
            }
          />

          {isPending ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {["a", "b", "c"].map((key) => (
                <Skeleton key={key} className="h-48 w-full rounded-lg" />
              ))}
            </div>
          ) : members.length === 0 ? (
            <Empty className="min-h-[40vh]">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <UsersRound />
                </EmptyMedia>
                <EmptyTitle>{t("lead:team.empty.title")}</EmptyTitle>
                <EmptyDescription>
                  {t("lead:team.empty.description")}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : tab === "day" ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {members.map((member) => (
                <TeamMemberCard key={member.id} member={member} />
              ))}
            </div>
          ) : (
            <div className="max-w-3xl space-y-4">
              <Button onClick={copyAll} disabled={sections.length === 0}>
                <Copy />
                {t("lead:team.copyAll")}
              </Button>
              {sections.map((section) => (
                <section key={section.id} className="space-y-1">
                  <h2 className="font-semibold text-body">{section.name}</h2>
                  <pre
                    className="whitespace-pre-wrap rounded-md border border-border/70 bg-muted/40 p-3 font-sans text-body"
                    data-testid={`team-standup-${section.id}`}
                  >
                    {section.markdown}
                  </pre>
                </section>
              ))}
            </div>
          )}
        </div>
      </WorkspaceLayout>
    </>
  );
}
