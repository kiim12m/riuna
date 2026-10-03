import { asc, inArray } from "drizzle-orm";
import db from "../../database";
import { userTable } from "../../database/schema";
import { leadIdsOf } from "../visibility";

/**
 * Quien es responsable de quien mira (ADR 059), para su aviso: «Tu
 * responsable, X, ve tu plan y tus cierres, no tu valoracion».
 */
export default async function getMyLeads({
  workspaceId,
  userId,
}: {
  workspaceId: string;
  userId: string;
}) {
  const leadIds = await leadIdsOf({ workspaceId, userId });
  // Sin esta salida, `inArray(col, [])` compila a `in ()`.
  if (leadIds.length === 0) return [];

  return db
    .select({ id: userTable.id, name: userTable.name })
    .from(userTable)
    .where(inArray(userTable.id, leadIds))
    .orderBy(asc(userTable.name));
}
