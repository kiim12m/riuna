import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { teamMemberTable, teamTable } from "../../database/schema";

/** Quien es responsable de que equipo en un espacio (ADR 059). */
export async function listTeamLeads(workspaceId: string) {
  return db
    .select({ teamId: teamMemberTable.teamId, userId: teamMemberTable.userId })
    .from(teamMemberTable)
    .innerJoin(teamTable, eq(teamTable.id, teamMemberTable.teamId))
    .where(
      and(
        eq(teamTable.workspaceId, workspaceId),
        eq(teamMemberTable.isLead, true),
      ),
    );
}

/**
 * Marca o desmarca al responsable de un equipo. El equipo tiene que ser de
 * este espacio y la persona estar en el: si no, 404, sin decir cual de las
 * dos falla.
 */
export async function setTeamLead({
  workspaceId,
  teamId,
  userId,
  isLead,
}: {
  workspaceId: string;
  teamId: string;
  userId: string;
  isLead: boolean;
}) {
  const [team] = await db
    .select({ id: teamTable.id })
    .from(teamTable)
    .where(
      and(eq(teamTable.id, teamId), eq(teamTable.workspaceId, workspaceId)),
    )
    .limit(1);

  const updated = team
    ? await db
        .update(teamMemberTable)
        .set({ isLead })
        .where(
          and(
            eq(teamMemberTable.teamId, teamId),
            eq(teamMemberTable.userId, userId),
          ),
        )
        .returning({ teamId: teamMemberTable.teamId })
    : [];

  if (updated.length === 0) {
    throw new HTTPException(404, { message: "Team member not found" });
  }

  return { teamId, userId, isLead };
}
