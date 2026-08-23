import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db, { schema } from "../database";

const NOT_ASSIGNABLE = "Team does not belong to this workspace";

// Un equipo inexistente devuelve el mismo 403 que uno de otro workspace: la
// diferencia solo serviria para sondear que ids existen fuera del propio.
export async function assertAssignableTeam(
  teamId: string,
  workspaceId: string,
): Promise<void> {
  const [team] = await db
    .select({ id: schema.teamTable.id })
    .from(schema.teamTable)
    .where(
      and(
        eq(schema.teamTable.id, teamId),
        eq(schema.teamTable.workspaceId, workspaceId),
      ),
    )
    .limit(1);

  if (!team) {
    throw new HTTPException(403, { message: NOT_ASSIGNABLE });
  }
}
