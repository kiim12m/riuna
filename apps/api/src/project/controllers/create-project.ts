import { eq, max, sql } from "drizzle-orm";
import db from "../../database";
import { columnTable, projectTable } from "../../database/schema";

/**
 * Las cuatro columnas de `docs/marca.md` §06, con sus nombres.
 *
 * **El slug no se traduce.** Es lo que compara `is_final`, el filtro de estado
 * y la definicion de «hecha» de la ADR 025, asi que sigue en ingles y estable;
 * lo unico que ve quien usa Riuna es el nombre. Una hoja que diga «To Do»
 * tambien entra: `statusKeys` casa el slug colapsando separadores.
 */
export const DEFAULT_PROJECT_COLUMNS = [
  { name: "Por hacer", slug: "to-do", position: 0, isFinal: false },
  { name: "En curso", slug: "in-progress", position: 1, isFinal: false },
  { name: "En revisión", slug: "in-review", position: 2, isFinal: false },
  { name: "Hecha", slug: "done", position: 3, isFinal: true },
] as const;

type ProjectInsert = typeof projectTable.$inferInsert;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Serialize ordering writes per workspace: without this, two concurrent
 * creates can read the same max(position) and land on the same slot, and a
 * create can interleave with a reorder's renumber. `reorderProjects` takes
 * the same lock with the same key. Transaction-scoped and reentrant, so a
 * caller may take it before `insertProject` takes it again.
 */
export async function lockWorkspaceProjects(tx: Tx, workspaceId: string) {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(1524, hashtext(${workspaceId}))`,
  );
}

/**
 * Inserta un proyecto al final del orden del espacio, con sus columnas. Va
 * aparte para que la Bandeja (ADR 051) nazca igual que cualquier proyecto,
 * dentro de la transaccion de quien la llama.
 */
export async function insertProject(
  tx: Tx,
  values: Omit<ProjectInsert, "position">,
) {
  await lockWorkspaceProjects(tx, values.workspaceId);

  // New projects go to the bottom of the workspace's ordering.
  const [{ maxPosition } = { maxPosition: null }] = await tx
    .select({ maxPosition: max(projectTable.position) })
    .from(projectTable)
    .where(eq(projectTable.workspaceId, values.workspaceId));

  const [createdProject] = await tx
    .insert(projectTable)
    .values({
      ...values,
      position: maxPosition === null ? 0 : maxPosition + 1,
    })
    .returning();

  if (createdProject) {
    for (const col of DEFAULT_PROJECT_COLUMNS) {
      await tx.insert(columnTable).values({
        projectId: createdProject.id,
        name: col.name,
        slug: col.slug,
        position: col.position,
        isFinal: col.isFinal,
      });
    }
  }

  return createdProject;
}

async function createProject(
  workspaceId: string,
  name: string,
  icon: string,
  slug: string,
) {
  return db.transaction((tx) =>
    insertProject(tx, { workspaceId, name, icon, slug }),
  );
}

export default createProject;
