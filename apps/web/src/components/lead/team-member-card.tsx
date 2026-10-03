import { Check, Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DayOffBadge } from "@/components/availability/day-off-badge";
import { DayLoadBar } from "@/components/planner/day-load-bar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { TeamDayMember } from "@/fetchers/lead";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/duration";
import { getInitials } from "@/lib/get-initials";
import { fromMinutes } from "@/lib/minutes";

/**
 * El dia de una persona para su responsable (5.3, ADR 059): solo lectura.
 * Plan con las imprescindibles delante, carga frente a su capacidad -con
 * ausencias y festivos-, lo terminado, lo registrado y su cierre publico.
 */
export function TeamMemberCard({ member }: { member: TeamDayMember }) {
  const { t, i18n } = useTranslation();
  const duration = (seconds: number) => formatDuration(seconds, i18n.language);

  return (
    <article
      className="flex flex-col gap-3 rounded-lg border border-border/60 bg-sidebar/40 p-3"
      data-testid={`team-member-${member.id}`}
    >
      <header className="flex items-center gap-2">
        <Avatar className="size-7">
          <AvatarImage src={member.image ?? ""} alt="" />
          <AvatarFallback className="text-meta">
            {getInitials(member.name)}
          </AvatarFallback>
        </Avatar>
        <h2 className="min-w-0 flex-1 truncate font-semibold text-body">
          {member.name}
        </h2>
        {member.unavailable && <DayOffBadge dayOff={member.unavailable} />}
      </header>

      <div className="space-y-1">
        <p className="text-meta text-muted-foreground tabular-nums">
          {t("lead:team.load", {
            planned: duration(member.load.loadSeconds),
            available: duration(member.load.capacitySeconds),
          })}
        </p>
        <DayLoadBar pct={member.load.pct} />
      </div>

      {member.planned.length > 0 ? (
        <ul className="space-y-1 text-body">
          {member.planned.map((task) => (
            <li key={task.id} className="flex items-center gap-1.5">
              {task.isDone ? (
                <Check className="size-3.5 shrink-0 text-success-foreground" />
              ) : task.keyRank !== null ? (
                <Star className="size-3.5 shrink-0 text-brand" />
              ) : (
                <span className="size-3.5 shrink-0" />
              )}
              {task.startMinute !== null && (
                <span className="font-mono text-meta text-muted-foreground tabular-nums">
                  {fromMinutes(task.startMinute)}
                </span>
              )}
              <span
                className={cn(
                  "min-w-0 truncate",
                  task.isDone && "text-muted-foreground line-through",
                )}
              >
                {task.title}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-meta text-muted-foreground">
          {t("lead:team.nothingPlanned")}
        </p>
      )}

      <p className="text-meta text-muted-foreground">
        {t("lead:team.figures", {
          count: member.done.length,
          worked: duration(member.workedSeconds),
        })}
      </p>

      <div className="border-border/60 border-t pt-2 text-meta">
        {member.close ? (
          <p data-testid="team-member-close">
            <span className="text-muted-foreground">
              {t("lead:team.closed")}
            </span>{" "}
            {member.close.blockers
              ? t("lead:team.blockers", { blockers: member.close.blockers })
              : t("lead:team.noBlockers")}
          </p>
        ) : (
          <p className="text-muted-foreground">{t("lead:team.notClosed")}</p>
        )}
      </div>
    </article>
  );
}
