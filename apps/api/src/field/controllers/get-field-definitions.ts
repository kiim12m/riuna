import { and, asc, eq, isNull, or } from "drizzle-orm";
import db from "../../database";
import { fieldDefinitionTable } from "../../database/schema";

/**
 * Los campos que aplican a un proyecto: los suyos mas los del espacio de
 * trabajo.
 *
 * Cuando los dos alcances declaran la misma clave gana el del proyecto, que es
 * el mas concreto. La base deja convivir las dos filas a proposito —sus
 * indices unicos son por alcance—, asi que el desempate tiene que estar aqui y
 * no alli.
 */
async function getFieldDefinitionsForProject(
  workspaceId: string,
  projectId: string,
  includeArchived = false,
) {
  const rows = await db
    .select()
    .from(fieldDefinitionTable)
    .where(
      and(
        eq(fieldDefinitionTable.workspaceId, workspaceId),
        or(
          eq(fieldDefinitionTable.projectId, projectId),
          isNull(fieldDefinitionTable.projectId),
        ),
        includeArchived ? undefined : isNull(fieldDefinitionTable.archivedAt),
      ),
    )
    .orderBy(
      asc(fieldDefinitionTable.position),
      asc(fieldDefinitionTable.name),
    );

  const byKey = new Map<string, (typeof rows)[number]>();

  for (const row of rows) {
    const winner = byKey.get(row.key);
    // Sin ganador previo, o el nuevo es del proyecto y el guardado del espacio.
    if (!winner || (row.projectId && !winner.projectId)) {
      byKey.set(row.key, row);
    }
  }

  return [...byKey.values()].sort(
    (a, b) => a.position - b.position || a.name.localeCompare(b.name),
  );
}

/** Solo las definiciones de alcance espacio de trabajo. */
async function getWorkspaceFieldDefinitions(
  workspaceId: string,
  includeArchived = false,
) {
  return db
    .select()
    .from(fieldDefinitionTable)
    .where(
      and(
        eq(fieldDefinitionTable.workspaceId, workspaceId),
        isNull(fieldDefinitionTable.projectId),
        includeArchived ? undefined : isNull(fieldDefinitionTable.archivedAt),
      ),
    )
    .orderBy(
      asc(fieldDefinitionTable.position),
      asc(fieldDefinitionTable.name),
    );
}

export { getFieldDefinitionsForProject, getWorkspaceFieldDefinitions };
