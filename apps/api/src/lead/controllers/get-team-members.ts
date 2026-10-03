import { loadPeople } from "../team-data";
import { visibleMemberIds } from "../visibility";

/** A quien ve un responsable: si no ve a nadie, no hay «Mi equipo». */
export default async function getTeamMembers({
  workspaceId,
  leadUserId,
}: {
  workspaceId: string;
  leadUserId: string;
}) {
  return loadPeople(await visibleMemberIds({ workspaceId, leadUserId }));
}
