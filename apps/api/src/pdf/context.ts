import { eq } from "drizzle-orm";
import db from "../database";
import {
  projectTable,
  userTable,
  workspaceTable,
  workspaceUserTable,
} from "../database/schema";

/** Los nombres de las personas del espacio, para los campos de tipo persona. */
export async function memberNames(workspaceId: string) {
  const rows = await db
    .select({ id: userTable.id, name: userTable.name })
    .from(workspaceUserTable)
    .innerJoin(userTable, eq(workspaceUserTable.userId, userTable.id))
    .where(eq(workspaceUserTable.workspaceId, workspaceId));
  return new Map(rows.map((row) => [row.id, row.name]));
}

/** De donde sale un documento: «Espacio / Proyecto». */
export async function projectContext(projectId: string) {
  const [row] = await db
    .select({
      name: projectTable.name,
      slug: projectTable.slug,
      workspaceId: projectTable.workspaceId,
      workspaceName: workspaceTable.name,
    })
    .from(projectTable)
    .innerJoin(workspaceTable, eq(projectTable.workspaceId, workspaceTable.id))
    .where(eq(projectTable.id, projectId));
  if (!row) throw new Error(`Project ${projectId} not found`);
  return { ...row, context: `${row.workspaceName} / ${row.name}` };
}

export function taskKey(slug: string, number: number | null) {
  return number == null ? "" : `${slug.toUpperCase()}-${number}`;
}

/** Quien genera el documento, para su pie. */
export async function personName(userId: string) {
  const [row] = await db
    .select({ name: userTable.name })
    .from(userTable)
    .where(eq(userTable.id, userId));
  return row?.name ?? "";
}
