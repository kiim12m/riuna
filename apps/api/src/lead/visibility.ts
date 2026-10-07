import { and, eq, ne, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import db from "../database";
import {
  teamMemberTable,
  teamTable,
  workspaceUserTable,
} from "../database/schema";

const leadRow = alias(teamMemberTable, "lead_row");
const memberRow = alias(teamMemberTable, "member_row");
const leadInWorkspace = alias(workspaceUserTable, "lead_in_workspace");
const memberInWorkspace = alias(workspaceUserTable, "member_in_workspace");

/**
 * **El unico sitio que decide quien ve a quien** (ADR 059). Todo lo que lee
 * el responsable de departamento pasa por aqui: las ADR 041, 046 y 047
 * pagaron tres fugas entre espacios por repetir un `WHERE` a mano.
 *
 * Un responsable ve a una persona si, a la vez:
 * - comparten un equipo de **este** espacio;
 * - el responsable lleva la marca en ese equipo;
 * - los dos siguen siendo miembros del espacio;
 * - y no son la misma persona.
 *
 * Una sola consulta de pares, que sirve en los dos sentidos.
 */
async function leadPairs(workspaceId: string, side: SQL) {
  return db
    .selectDistinct({ leadId: leadRow.userId, memberId: memberRow.userId })
    .from(leadRow)
    .innerJoin(
      teamTable,
      and(
        eq(teamTable.id, leadRow.teamId),
        eq(teamTable.workspaceId, workspaceId),
      ),
    )
    .innerJoin(
      memberRow,
      and(
        eq(memberRow.teamId, leadRow.teamId),
        ne(memberRow.userId, leadRow.userId),
      ),
    )
    .innerJoin(
      leadInWorkspace,
      and(
        eq(leadInWorkspace.workspaceId, workspaceId),
        eq(leadInWorkspace.userId, leadRow.userId),
      ),
    )
    .innerJoin(
      memberInWorkspace,
      and(
        eq(memberInWorkspace.workspaceId, workspaceId),
        eq(memberInWorkspace.userId, memberRow.userId),
      ),
    )
    .where(and(eq(leadRow.isLead, true), side));
}

/** A quien ve un responsable en un espacio. */
export async function visibleMemberIds({
  workspaceId,
  leadUserId,
}: {
  workspaceId: string;
  leadUserId: string;
}): Promise<string[]> {
  const pairs = await leadPairs(workspaceId, eq(leadRow.userId, leadUserId));
  return pairs.map((pair) => pair.memberId);
}

/** Quien ve a una persona en un espacio: lo que dice su aviso. */
export async function leadIdsOf({
  workspaceId,
  userId,
}: {
  workspaceId: string;
  userId: string;
}): Promise<string[]> {
  const pairs = await leadPairs(workspaceId, eq(memberRow.userId, userId));
  return pairs.map((pair) => pair.leadId);
}

/**
 * Si alguien lleva la marca de responsable en un equipo de **este** espacio y
 * sigue siendo miembro. Es lo que le deja programar el envio del stand-up de
 * su gente (ADR 068).
 */
export async function isLeadOfTeam({
  workspaceId,
  teamId,
  userId,
}: {
  workspaceId: string;
  teamId: string;
  userId: string;
}): Promise<boolean> {
  const [row] = await db
    .select({ userId: leadRow.userId })
    .from(leadRow)
    .innerJoin(
      teamTable,
      and(
        eq(teamTable.id, leadRow.teamId),
        eq(teamTable.workspaceId, workspaceId),
      ),
    )
    .innerJoin(
      leadInWorkspace,
      and(
        eq(leadInWorkspace.workspaceId, workspaceId),
        eq(leadInWorkspace.userId, leadRow.userId),
      ),
    )
    .where(
      and(
        eq(leadRow.teamId, teamId),
        eq(leadRow.userId, userId),
        eq(leadRow.isLead, true),
      ),
    )
    .limit(1);
  return Boolean(row);
}
