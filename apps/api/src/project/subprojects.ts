import { and, asc, eq, isNull } from "drizzle-orm";
import db from "../database";
import { projectTable } from "../database/schema";
import { FilterError } from "../view/filter-to-sql";

/** Los subproyectos sin archivar de un proyecto (ADR 089), en su orden. */
export async function subprojectIds(projectId: string) {
  const rows = await db
    .select({ id: projectTable.id })
    .from(projectTable)
    .where(
      and(
        eq(projectTable.parentId, projectId),
        isNull(projectTable.archivedAt),
      ),
    )
    .orderBy(asc(projectTable.position), asc(projectTable.name));
  return rows.map((row) => row.id);
}

/**
 * Lo mismo para el padre y, si se pide, para cada subproyecto. Un filtro por
 * un campo que un hijo no tiene no casa con ninguna de sus tareas: ese hijo no
 * aporta nada, en vez de tumbar la peticion entera.
 */
export async function forProjectAndSubprojects<T>(
  projectId: string,
  includeSubprojects: boolean,
  load: (id: string) => Promise<T>,
): Promise<T[]> {
  const own = await load(projectId);
  if (!includeSubprojects) return [own];
  const children = await Promise.all(
    (await subprojectIds(projectId)).map(async (id) => {
      try {
        return await load(id);
      } catch (error) {
        if (error instanceof FilterError) return null;
        throw error;
      }
    }),
  );
  return [
    own,
    ...children.filter((entry): entry is Awaited<T> => entry !== null),
  ];
}
