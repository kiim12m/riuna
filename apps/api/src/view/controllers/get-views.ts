import { and, asc, eq, isNull, or } from "drizzle-orm";
import db from "../../database";
import { viewTable } from "../../database/schema";

/**
 * Las vistas que alguien puede usar en un proyecto: las suyas y las
 * compartidas, mas las de alcance espacio de trabajo.
 *
 * La visibilidad es por propiedad y no por rol: una vista solo dice como
 * mirar las tareas, no cambia ninguna. Ver la ADR 015.
 */
async function getViews({
  workspaceId,
  projectId,
  userId,
  type,
}: {
  workspaceId: string;
  projectId?: string | null;
  userId: string;
  type?: string;
}) {
  return db
    .select()
    .from(viewTable)
    .where(
      and(
        eq(viewTable.workspaceId, workspaceId),
        isNull(viewTable.archivedAt),
        type ? eq(viewTable.type, type) : undefined,
        projectId
          ? or(eq(viewTable.projectId, projectId), isNull(viewTable.projectId))
          : isNull(viewTable.projectId),
        or(eq(viewTable.isShared, true), eq(viewTable.createdBy, userId)),
      ),
    )
    .orderBy(asc(viewTable.position), asc(viewTable.name));
}

export default getViews;
