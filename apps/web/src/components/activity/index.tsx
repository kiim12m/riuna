import { Calendar, CircleAlert, History, UserRound, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import useActiveWorkspace from "@/hooks/queries/workspace/use-active-workspace";
import useGetWorkspaceUsers from "@/hooks/queries/workspace-users/use-get-workspace-users";
import { parseDayKey } from "@/lib/day-key";
import { formatDuration } from "@/lib/duration";
import { formatDateMedium, formatRelativeTime } from "@/lib/format";
import { getInitials } from "@/lib/get-initials";
import { getPriorityLabel, getStatusLabel } from "@/lib/i18n/domain";
import {
  type FieldDefinition,
  formatForDisplay,
} from "../table-view/custom-field-cell";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "../ui/preview-card";
import { TimelineContent, TimelineItem } from "../ui/timeline";
import CommentCard from "./comment-card";
import { isCommentActivity } from "./utils";

type ActivityItem = {
  type: string;
  content: string | null;
  eventData?: unknown;
  id: string;
  createdAt: string;
  userId: string | null;
  taskId: string;
  externalUserName?: string | null;
  externalUserAvatar?: string | null;
  externalSource?: string | null;
  externalUrl?: string | null;
};

function getEventDataRecord(
  eventData: unknown,
): Record<string, unknown> | null {
  if (!eventData || typeof eventData !== "object" || Array.isArray(eventData)) {
    return null;
  }

  return eventData as Record<string, unknown>;
}

type WorkspaceUser = {
  user?: {
    id?: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  } | null;
};

function getActivityTypeIcon(type: string) {
  const iconClass = "h-4 w-4";
  switch (type) {
    case "status_changed":
      return <History className={iconClass} />;
    case "priority_changed":
      return <CircleAlert className={iconClass} />;
    case "due_date_changed":
      return <Calendar className={iconClass} />;
    case "assignee_changed":
    case "unassigned":
      return <UserRound className={iconClass} />;
    case "team_changed":
    case "team_unassigned":
    case "assignees_changed":
      return <Users className={iconClass} />;
    case "parent_changed":
    case "epics_changed":
    case "custom_field_changed":
      return <History className={iconClass} />;
    default:
      return <History className={iconClass} />;
  }
}

function formatActivityDateText(value: string) {
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return formatDateMedium(parsed);
  }

  const slashMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!slashMatch) return value;
  const [, month, day, year] = slashMatch;
  const fromSlashDate = new Date(`${year}-${month}-${day}T00:00:00`);
  if (Number.isNaN(fromSlashDate.getTime())) return value;
  return formatDateMedium(fromSlashDate);
}

/**
 * El valor de un campo personalizado tal como se lee en una frase: la etiqueta
 * de la opcion y no su clave, la fecha como fecha y la persona por su nombre.
 * Si el campo ya no existe, el valor guardado tal cual.
 */
function formatFieldValue(
  value: unknown,
  empty: string,
  definition: FieldDefinition | undefined,
  users: WorkspaceUser[] | undefined,
) {
  if (value === null || value === undefined || value === "") return empty;

  if (definition?.type === "date" && typeof value === "string") {
    // Un dia suelto es medianoche local, no UTC (ADR 049).
    return /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? formatDateMedium(parseDayKey(value))
      : formatActivityDateText(value);
  }

  if (definition?.type === "user") {
    const nameOf = (id: unknown) =>
      users?.find((member) => member.user?.id === id)?.user?.name ?? String(id);
    return Array.isArray(value) ? value.map(nameOf).join(", ") : nameOf(value);
  }

  if (definition) return formatForDisplay(definition, value) || empty;
  if (Array.isArray(value)) return value.map(String).join(", ");
  return String(value);
}

function toDisplayCase(value: string) {
  return value
    .replace(/[-_]/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function findUserByName(users: WorkspaceUser[] | undefined, name: string) {
  if (!users) return null;
  const matches = users.filter(
    (member) =>
      member.user?.name?.toLowerCase().trim() === name.toLowerCase().trim(),
  );

  if (matches.length !== 1) return null;
  return matches[0];
}

function UserHoverName({
  user,
  fallbackName,
}: {
  user: WorkspaceUser | null;
  fallbackName: string;
}) {
  if (!user?.user) {
    return <span className="font-medium text-foreground">{fallbackName}</span>;
  }

  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <span className="cursor-pointer font-medium text-foreground transition-colors hover:text-primary">
          {user.user.name}
        </span>
      </HoverCardTrigger>
      <HoverCardContent className="w-52 p-3">
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarImage
              src={user.user.image ?? ""}
              alt={user.user.name || ""}
            />
            <AvatarFallback className="bg-muted text-xs font-medium">
              {getInitials(user.user.name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground leading-none">
              {user.user.name}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {user.user.email}
            </p>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

function ActorAvatar({
  user,
  fallbackName,
}: {
  user: WorkspaceUser | null;
  fallbackName: string;
}) {
  return (
    <Avatar className="size-6">
      <AvatarImage src={user?.user?.image ?? ""} alt={fallbackName} />
      <AvatarFallback className="bg-muted text-label font-medium">
        {getInitials(fallbackName)}
      </AvatarFallback>
    </Avatar>
  );
}

function renderActivityContent({
  activity,
  workspaceUsers,
  fieldDefinitions,
  t,
  language,
}: {
  activity: ActivityItem;
  workspaceUsers: WorkspaceUser[] | undefined;
  fieldDefinitions: readonly FieldDefinition[] | undefined;
  t: (key: string, options?: Record<string, unknown>) => string;
  language: string;
}) {
  const content = activity.content || "";
  const eventData = getEventDataRecord(activity.eventData);

  if (activity.type === "priority_changed") {
    if (eventData) {
      return (
        <span className="text-sm text-muted-foreground">
          {t("activity:changedPriority", {
            from: getPriorityLabel(String(eventData.oldPriority ?? "")),
            to: getPriorityLabel(String(eventData.newPriority ?? "")),
          })}
        </span>
      );
    }

    const match = content.match(
      /changed priority from "?(.+?)"? to "?(.+?)"?$/i,
    );
    if (!match) {
      return <span className="text-sm text-muted-foreground">{content}</span>;
    }

    return (
      <span className="text-sm text-muted-foreground">
        {t("activity:changedPriority", {
          from: getPriorityLabel(match[1]),
          to: getPriorityLabel(match[2]),
        })}
      </span>
    );
  }

  if (activity.type === "status_changed") {
    if (eventData) {
      return (
        <span className="text-sm text-muted-foreground">
          {t("activity:changedStatus", {
            from: getStatusLabel(String(eventData.oldStatus ?? "")),
            to: getStatusLabel(String(eventData.newStatus ?? "")),
          })}
        </span>
      );
    }

    const match = content.match(/changed status from "?(.+?)"? to "?(.+?)"?$/i);
    if (!match) {
      return <span className="text-sm text-muted-foreground">{content}</span>;
    }

    return (
      <span className="text-sm text-muted-foreground">
        {t("activity:changedStatus", {
          from: getStatusLabel(match[1]),
          to: getStatusLabel(match[2]),
        })}
      </span>
    );
  }

  if (activity.type === "due_date_changed") {
    if (eventData) {
      const oldDueDate = eventData.oldDueDate
        ? formatActivityDateText(String(eventData.oldDueDate))
        : null;
      const newDueDate = eventData.newDueDate
        ? formatActivityDateText(String(eventData.newDueDate))
        : null;

      return (
        <span className="text-sm text-muted-foreground">
          {newDueDate
            ? oldDueDate
              ? t("activity:changedDueDate", {
                  from: oldDueDate,
                  to: newDueDate,
                })
              : t("activity:setDueDate", { date: newDueDate })
            : t("activity:clearedDueDate")}
          {eventData.cascadedFrom ? ` ${t("activity:bySchedule")}` : null}
        </span>
      );
    }

    const changeMatch = content.match(/changed due date from (.+) to (.+)$/i);
    if (changeMatch) {
      return (
        <span className="text-sm text-muted-foreground">
          {t("activity:changedDueDate", {
            from: formatActivityDateText(changeMatch[1]),
            to: formatActivityDateText(changeMatch[2]),
          })}
        </span>
      );
    }

    const setMatch = content.match(/set due date to (.+)$/i);
    if (setMatch) {
      return (
        <span className="text-sm text-muted-foreground">
          {t("activity:setDueDate", {
            date: formatActivityDateText(setMatch[1]),
          })}
        </span>
      );
    }

    if (content.includes("cleared the due date")) {
      return (
        <span className="text-sm text-muted-foreground">
          {t("activity:clearedDueDate")}
        </span>
      );
    }

    return <span className="text-sm text-muted-foreground">{content}</span>;
  }

  if (activity.type === "unassigned") {
    return (
      <span className="text-sm text-muted-foreground">
        {t("activity:unassigned")}
      </span>
    );
  }

  if (activity.type === "assignee_changed") {
    if (eventData) {
      if (eventData.isSelfAssigned) {
        return (
          <span className="text-sm text-muted-foreground">
            {t("activity:assignedToSelf")}
          </span>
        );
      }

      const targetId = String(eventData.newAssigneeId ?? "");
      const targetName = String(eventData.newAssignee ?? "");
      const targetUser =
        workspaceUsers?.find((member) => member.user?.id === targetId) || null;

      return (
        <span className="text-sm text-muted-foreground">
          {t("activity:assignedTo", {
            name: targetUser?.user?.name ?? targetName,
          })}
        </span>
      );
    }

    if (content.includes("themselves")) {
      return (
        <span className="text-sm text-muted-foreground">
          {t("activity:assignedToSelf")}
        </span>
      );
    }

    const tokenMatch = content.match(
      /assigned the task to \[\[user:([^|\]]+)\|([^\]]+)\]\]/,
    );
    if (tokenMatch) {
      const [, targetId, targetName] = tokenMatch;
      const targetUser =
        workspaceUsers?.find((member) => member.user?.id === targetId) || null;

      return (
        <span className="text-sm text-muted-foreground">
          {t("activity:assignedTo", {
            name: targetUser?.user?.name ?? targetName,
          })}
        </span>
      );
    }

    const legacyMatch = content.match(/assigned the task to (.+)$/i);
    if (legacyMatch) {
      const targetName = legacyMatch[1];
      const targetUser = findUserByName(workspaceUsers, targetName);
      return (
        <span className="text-sm text-muted-foreground">
          {t("activity:assignedTo", {
            name: targetUser?.user?.name ?? targetName,
          })}
        </span>
      );
    }
  }

  // Tipos nuevos de Riuna: no existen filas historicas, asi que no necesitan
  // los reanalisis de `content` que arrastran los tipos heredados.
  if (activity.type === "custom_field_changed" && eventData) {
    const name = String(eventData.name ?? "");
    const definition = fieldDefinitions?.find(
      (entry) => entry.key === eventData.key,
    );
    if (!eventData.hasValues) {
      return (
        <span className="text-sm text-muted-foreground">
          {t("activity:customFieldChangedPlain", { name })}
        </span>
      );
    }

    return (
      <span className="text-sm text-muted-foreground">
        {t("activity:customFieldChanged", {
          name,
          from: formatFieldValue(
            eventData.from,
            t("activity:emptyValue"),
            definition,
            workspaceUsers,
          ),
          to: formatFieldValue(
            eventData.to,
            t("activity:emptyValue"),
            definition,
            workspaceUsers,
          ),
        })}
      </span>
    );
  }

  if (activity.type === "team_unassigned") {
    return (
      <span className="text-sm text-muted-foreground">
        {t("activity:teamUnassigned")}
      </span>
    );
  }

  if (activity.type === "team_changed" && eventData) {
    return (
      <span className="text-sm text-muted-foreground">
        {t("activity:assignedToTeam", {
          name: String(eventData.newTeam ?? ""),
        })}
      </span>
    );
  }

  // Los tres tipos que la Fase 4.5 devolvio al historial.
  if (activity.type === "assignees_changed" && eventData) {
    const names = Array.isArray(eventData.assigneeNames)
      ? (eventData.assigneeNames as string[])
      : [];

    return (
      <span className="text-sm text-muted-foreground">
        {names.length > 0
          ? t("activity:assignedTo", { name: names.join(", ") })
          : t("activity:unassigned")}
      </span>
    );
  }

  // La fecha de inicio, las fechas automaticas y mover la rama (ADR 083).
  if (activity.type === "start_date_changed" && eventData) {
    const oldStart = eventData.oldStartDate
      ? formatActivityDateText(String(eventData.oldStartDate))
      : null;
    const newStart = eventData.newStartDate
      ? formatActivityDateText(String(eventData.newStartDate))
      : null;
    return (
      <span className="text-sm text-muted-foreground">
        {newStart
          ? oldStart
            ? t("activity:changedStartDate", { from: oldStart, to: newStart })
            : t("activity:setStartDate", { date: newStart })
          : t("activity:clearedStartDate")}
        {eventData.cascadedFrom ? ` ${t("activity:bySchedule")}` : null}
      </span>
    );
  }

  // Seguir a otra tarea, cambiar el desfase o dejar de seguirla (ADR 084).
  if (activity.type === "precedence_changed" && eventData) {
    const lag = Number(eventData.lag ?? 0);
    return (
      <span className="text-sm text-muted-foreground">
        {eventData.action === "removed"
          ? t("activity:precedenceRemoved")
          : eventData.action === "updated"
            ? t("activity:precedenceLagChanged", { lag })
            : t("activity:precedenceAdded", { lag })}
      </span>
    );
  }

  if (activity.type === "auto_dates_changed" && eventData) {
    return (
      <span className="text-sm text-muted-foreground">
        {eventData.autoDates
          ? t("activity:switchedToAutoDates")
          : t("activity:switchedToOwnDates")}
      </span>
    );
  }

  if (activity.type === "branch_shifted" && eventData) {
    return (
      <span className="text-sm text-muted-foreground">
        {t("activity:shiftedBranch", {
          count: Number(eventData.moved ?? 0),
          days: Number(eventData.workDays ?? 0),
        })}
      </span>
    );
  }

  // Hacerla hito o dejar de serlo (ADR 082).
  if (activity.type === "milestone_changed" && eventData) {
    return (
      <span className="text-sm text-muted-foreground">
        {eventData.isMilestone
          ? t("activity:markedMilestone")
          : t("activity:unmarkedMilestone")}
      </span>
    );
  }

  // La estimacion, en segundos en la base (ADR 085).
  if (activity.type === "estimate_changed" && eventData) {
    const from = Number(eventData.oldEstimate ?? 0);
    const to = Number(eventData.newEstimate ?? 0);
    return (
      <span className="text-sm text-muted-foreground">
        {to > 0
          ? from > 0
            ? t("activity:changedEstimate", {
                from: formatDuration(from, language),
                to: formatDuration(to, language),
              })
            : t("activity:setEstimate", {
                estimate: formatDuration(to, language),
              })
          : t("activity:clearedEstimate")}
      </span>
    );
  }

  if (activity.type === "parent_changed" && eventData) {
    return (
      <span className="text-sm text-muted-foreground">
        {eventData.newParentId
          ? t("activity:nestedUnderTask")
          : t("activity:promotedToRoot")}
      </span>
    );
  }

  if (activity.type === "epics_changed" && eventData) {
    const epicIds = Array.isArray(eventData.epicIds)
      ? (eventData.epicIds as string[])
      : [];

    return (
      <span className="text-sm text-muted-foreground">
        {epicIds.length > 0
          ? t("activity:epicsUpdated", { count: epicIds.length })
          : t("activity:epicsCleared")}
      </span>
    );
  }

  if (activity.type === "title_changed") {
    if (eventData) {
      return (
        <span className="text-sm text-muted-foreground">
          {t("activity:changedTitle", {
            from: String(eventData.oldTitle ?? ""),
            to: String(eventData.newTitle ?? ""),
          })}
        </span>
      );
    }

    const legacyMatch = content.match(/changed title from "(.+)" to "(.+)"$/i);
    if (legacyMatch) {
      return (
        <span className="text-sm text-muted-foreground">
          {t("activity:changedTitle", {
            from: legacyMatch[1],
            to: legacyMatch[2],
          })}
        </span>
      );
    }
  }

  if (activity.type === "moved") {
    if (eventData) {
      return (
        <span className="text-sm text-muted-foreground">
          {t("activity:moved", {
            from: String(eventData.fromProjectName ?? ""),
            to: String(eventData.toProjectName ?? ""),
          })}
        </span>
      );
    }
  }

  if (activity.type === "created") {
    if (eventData) {
      return (
        <span className="text-sm text-muted-foreground">
          {t("activity:created")}
        </span>
      );
    }
  }

  return (
    <span className="text-sm text-muted-foreground">
      {content || toDisplayCase(activity.type)}
    </span>
  );
}

function Activity({
  activity,
  step,
  showConnector = false,
  fieldDefinitions,
}: {
  activity: ActivityItem;
  step: number;
  showConnector?: boolean;
  /** Los campos del proyecto, para leer los cambios de campo con sus etiquetas. */
  fieldDefinitions?: readonly FieldDefinition[];
}) {
  const { t, i18n } = useTranslation();
  const { data: workspace } = useActiveWorkspace();
  const { data: workspaceUsers } = useGetWorkspaceUsers({
    workspaceId: workspace?.id,
  });

  const user = activity.userId
    ? workspaceUsers?.find(
        (workspaceUser) => workspaceUser.user?.id === activity.userId,
      )
    : null;

  const isExternalComment = Boolean(activity.externalSource);
  // Un cambio que hizo una automatizacion (ADR 067) es de la regla, no de
  // quien la guardo: se nombra a ella y no se pinta a nadie. Una accion de un
  // clic (ADR 078) es de quien la pulso, a traves de la regla.
  const automation = getEventDataRecord(
    getEventDataRecord(activity.eventData)?.automation,
  );
  const pressed = Boolean(automation?.pressedBy);
  const actor = automation && !pressed ? null : user;
  const personName = user?.user?.name || t("common:people.someone");
  const actorName = !automation
    ? personName
    : pressed
      ? t("activity:manualAutomationActor", {
          user: personName,
          name: String(automation.name ?? ""),
        })
      : t("activity:automationActor", { name: String(automation.name ?? "") });

  if (isCommentActivity(activity)) {
    const commentUser = isExternalComment
      ? {
          id: undefined,
          name: activity.externalUserName ?? t("common:people.someone"),
          email: undefined,
          image: activity.externalUserAvatar ?? undefined,
        }
      : {
          id: user?.user?.id,
          name: user?.user?.name,
          email: user?.user?.email,
          image: user?.user?.image,
        };

    return (
      <TimelineItem className="m-0! flex-row items-start py-2!" step={step}>
        <TimelineContent className="min-w-0 flex-1">
          <CommentCard
            commentId={activity.id}
            taskId={activity.taskId}
            content={activity.content || ""}
            user={commentUser}
            createdAt={activity.createdAt}
          />
        </TimelineContent>
      </TimelineItem>
    );
  }

  const activityIcon = getActivityTypeIcon(activity.type);

  return (
    <TimelineItem
      className="relative m-0! flex-row items-center gap-3 py-2.5!"
      step={step}
    >
      {showConnector && (
        <span className="-translate-x-1/2 absolute top-9 bottom-0 left-3 w-px bg-[color-mix(in_srgb,var(--foreground)_18%,transparent)] dark:bg-[color-mix(in_srgb,var(--foreground)_26%,transparent)]" />
      )}
      <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground/80">
        {activityIcon}
      </span>
      <ActorAvatar user={actor || null} fallbackName={actorName} />
      <TimelineContent className="text-sm leading-6 text-foreground">
        <UserHoverName user={actor || null} fallbackName={actorName} />{" "}
        {renderActivityContent({
          activity,
          workspaceUsers: workspaceUsers as WorkspaceUser[] | undefined,
          fieldDefinitions,
          t,
          language: i18n.language,
        })}{" "}
        <span className="whitespace-nowrap text-muted-foreground/70 text-xs">
          {formatRelativeTime(activity.createdAt)}
        </span>
      </TimelineContent>
    </TimelineItem>
  );
}

export default Activity;
