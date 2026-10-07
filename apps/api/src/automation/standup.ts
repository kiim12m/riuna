import { and, eq } from "drizzle-orm";
import db from "../database";
import {
  automationRunTable,
  type automationTable,
  teamMemberTable,
  teamTable,
  userTable,
  workspaceUserTable,
} from "../database/schema";
import { loadStandups } from "../review/standup-batch";
import { STANDUP_LABELS_ES, standupMarkdown } from "../review/standup-text";
import {
  endOfServerDay,
  serverDayKey,
  serverTimeZone,
  startOfServerDay,
} from "../utils/day-boundaries";
import { loadUnavailableDaysForUsers } from "../work-schedule/unavailable-days";
import { openDestination, postToChat } from "./actions/outbound";
import type { Action } from "./definition";
import { ruleActorCanRun } from "./permissions";
import { pauseRule, type RunStatus, recordRun } from "./run";

type AutomationRow = typeof automationTable.$inferSelect;

/** La hora de pared de la instancia, `HH:MM`. */
function serverClock(now: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: serverTimeZone(),
  }).format(now);
}

async function alreadySent(ruleId: string, day: string) {
  const [row] = await db
    .select({ id: automationRunTable.id })
    .from(automationRunTable)
    .where(
      and(
        eq(automationRunTable.automationId, ruleId),
        eq(automationRunTable.occurrence, day),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/** La gente del departamento que sigue en el espacio, con su nombre. */
async function teamPeople(teamId: string, workspaceId: string) {
  return db
    .select({ id: userTable.id, name: userTable.name, team: teamTable.name })
    .from(teamMemberTable)
    .innerJoin(teamTable, eq(teamTable.id, teamMemberTable.teamId))
    .innerJoin(userTable, eq(userTable.id, teamMemberTable.userId))
    .innerJoin(
      workspaceUserTable,
      and(
        eq(workspaceUserTable.userId, teamMemberTable.userId),
        eq(workspaceUserTable.workspaceId, workspaceId),
      ),
    )
    .where(
      and(
        eq(teamMemberTable.teamId, teamId),
        eq(teamTable.workspaceId, workspaceId),
      ),
    )
    .orderBy(userTable.name);
}

/**
 * El envio del stand-up de un departamento (ADR 068), una vez al dia a partir
 * de su hora. No sale en festivo; quien esta ausente no aparece. Nunca lleva
 * la valoracion del dia: sale de `loadStandups`, que no la lee.
 */
export async function sendScheduledStandup(rule: AutomationRow, now: Date) {
  const { weekdays = [], time = "23:59" } = rule.triggerConfig as {
    weekdays?: number[];
    time?: string;
  };
  const day = serverDayKey(now);
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  if (!weekdays.includes(weekday) || serverClock(now) < time) return;
  if (await alreadySent(rule.id, day)) return;

  const done = (status: RunStatus, detail: Record<string, unknown>) =>
    recordRun({ rule, taskId: null, status, detail, occurrence: day });

  if (!rule.teamId) return done("failed", { error: "The rule has no team" });
  if (!rule.updatedBy || !(await ruleActorCanRun(rule))) {
    await pauseRule(rule, "actor_lost_permission");
    return done("skipped", { reason: "actor_lost_permission" });
  }

  const people = await teamPeople(rule.teamId, rule.workspaceId);
  if (people.length === 0) return done("skipped", { reason: "no_members" });

  const today = startOfServerDay(now);
  const unavailable = await loadUnavailableDaysForUsers({
    workspaceId: rule.workspaceId,
    userIds: people.map((person) => person.id),
    start: today,
    end: endOfServerDay(today),
  });
  const away = (id: string) => unavailable.get(id)?.get(day);
  if (people.some((person) => away(person.id)?.kind === "holiday")) {
    return done("skipped", { reason: "holiday" });
  }
  const present = people.filter((person) => !away(person.id));
  if (present.length === 0) return done("skipped", { reason: "everyone_away" });

  const standups = await loadStandups({
    workspaceId: rule.workspaceId,
    userIds: present.map((person) => person.id),
    now,
  });
  const text = [
    `**Stand-up de ${people[0]?.team ?? ""}** · ${STANDUP_LABELS_ES.day(day)}`,
    ...present.flatMap((person) => {
      const standup = standups.get(person.id);
      return standup
        ? [
            "",
            `**${person.name}**`,
            standupMarkdown(standup, STANDUP_LABELS_ES),
          ]
        : [];
    }),
  ].join("\n");

  const results: Record<string, unknown>[] = [];
  let status: RunStatus = "ok";
  for (const action of rule.actions as Action[]) {
    if (action.type !== "standup") continue;
    try {
      await postToChat(
        action.channel,
        openDestination(action.destination),
        text,
      );
      results.push({ id: action.id, type: action.type, status: "ok" });
    } catch (error) {
      status = "failed";
      results.push({
        id: action.id,
        type: action.type,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return done(status, { people: present.length, actions: results });
}
