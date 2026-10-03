import { eq } from "drizzle-orm";
import db from "../database";
import { teamMemberTable, workspaceUserTable } from "../database/schema";
import { publishEvent } from "../events";
import { leadIdsOf } from "../lead/visibility";

/**
 * A quien le cambia lo que ve cuando cambian los dias no disponibles o el
 * responsable de un departamento (ADR 060, ADR 059). El destinatario se
 * resuelve al publicar para que el suscriptor del WebSocket no consulte nada.
 */
export async function publishAvailabilityChanged(
  workspaceId: string,
  userIds: string[],
) {
  if (userIds.length === 0) return;
  await publishEvent("availability.changed", {
    workspaceId,
    userIds: [...new Set(userIds)],
  });
}

/** Un festivo se nota en el plan de todo el espacio. */
export async function notifyHolidayChanged(workspaceId: string) {
  const members = await db
    .select({ userId: workspaceUserTable.userId })
    .from(workspaceUserTable)
    .where(eq(workspaceUserTable.workspaceId, workspaceId));
  await publishAvailabilityChanged(
    workspaceId,
    members.map((member) => member.userId),
  );
}

/** Una ausencia la nota quien la tiene y quienes ven su plan. */
export async function notifyTimeOffChanged(
  workspaceId: string,
  userId: string,
) {
  await publishAvailabilityChanged(workspaceId, [
    userId,
    ...(await leadIdsOf({ workspaceId, userId })),
  ]);
}

/** Marcar o desmarcar a un responsable cambia lo que ve todo su equipo. */
export async function notifyTeamLeadChanged(
  workspaceId: string,
  teamId: string,
) {
  const members = await db
    .select({ userId: teamMemberTable.userId })
    .from(teamMemberTable)
    .where(eq(teamMemberTable.teamId, teamId));
  await publishAvailabilityChanged(
    workspaceId,
    members.map((member) => member.userId),
  );
}
