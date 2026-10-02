import { and, eq } from "drizzle-orm";
import db from "../database";
import { projectTable, userTable } from "../database/schema";
import {
  insertProject,
  lockWorkspaceProjects,
} from "../project/controllers/create-project";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * La clave de las tareas de toda Bandeja: `BAN-12`. Se repite entre personas
 * del mismo espacio, como ya podian repetirse las de dos proyectos: las claves
 * nunca fueron unicas, y la busqueda por clave devuelve todas las que casan.
 */
const INBOX_SLUG = "BAN";

/** La Bandeja de una persona en un espacio, o `null` si aun no la ha usado. */
export async function findInbox(
  workspaceId: string,
  userId: string,
  executor: typeof db | Tx = db,
) {
  const [inbox] = await executor
    .select()
    .from(projectTable)
    .where(
      and(
        eq(projectTable.workspaceId, workspaceId),
        eq(projectTable.ownerUserId, userId),
      ),
    )
    .limit(1);

  return inbox ?? null;
}

/**
 * La Bandeja de una persona, creandola la primera vez que se usa (ADR 051).
 *
 * Dos capturas simultaneas no pueden crear dos: la segunda espera el mismo
 * candado que ordena los proyectos del espacio, y al tenerlo ya ve la Bandeja
 * de la primera. El indice unico parcial es la red para quien escriba sin el
 * candado.
 */
export async function ensureInbox(workspaceId: string, userId: string) {
  const existing = await findInbox(workspaceId, userId);
  if (existing) return existing;

  return db.transaction(async (tx) => {
    await lockWorkspaceProjects(tx, workspaceId);

    const raced = await findInbox(workspaceId, userId, tx);
    if (raced) return raced;

    const [owner] = await tx
      .select({ name: userTable.name })
      .from(userTable)
      .where(eq(userTable.id, userId));

    // Con el nombre de la persona, y no solo «Bandeja»: sus tareas salen en
    // las pantallas de los demas, y si la persona se va, el proyecto que
    // queda tiene que decir de quien era.
    return insertProject(tx, {
      workspaceId,
      ownerUserId: userId,
      name: owner?.name ? `Bandeja de ${owner.name}` : "Bandeja",
      icon: "Inbox",
      slug: INBOX_SLUG,
    });
  });
}
