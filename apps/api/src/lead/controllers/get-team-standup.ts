import { loadStandups } from "../../review/standup-batch";
import { loadPeople } from "../team-data";
import { visibleMemberIds } from "../visibility";

/**
 * El stand-up de la gente de un responsable (5.3, ADR 059): el mismo que cada
 * persona ve en Hoy (2.4), porque comparten `loadStandups`.
 */
export default async function getTeamStandup({
  workspaceId,
  leadUserId,
  now = new Date(),
}: {
  workspaceId: string;
  leadUserId: string;
  now?: Date;
}) {
  const ids = await visibleMemberIds({ workspaceId, leadUserId });
  if (ids.length === 0) return { members: [] };

  const [people, standups] = await Promise.all([
    loadPeople(ids),
    loadStandups({ workspaceId, userIds: ids, now }),
  ]);

  return {
    members: people.flatMap((person) => {
      const standup = standups.get(person.id);
      return standup ? [{ ...person, standup }] : [];
    }),
  };
}
