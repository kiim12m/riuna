import { and, eq } from "drizzle-orm";
import db from "../database";
import { projectTable, userTable } from "../database/schema";
import {
  insertProject,
  lockWorkspaceProjects,
} from "../project/controllers/create-project";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * La clave de las tareas de todo proyecto Personal: `PER-12`. Se repite entre
 * personas del mismo espacio, como ya podian repetirse las de dos proyectos:
 * las claves nunca fueron unicas, y la busqueda por clave devuelve todas las
 * que casan.
 */
const INBOX_SLUG = "PER";

/**
 * El proyecto Personal -antes «Bandeja», ADR 051- de una persona en un
 * espacio, o `null` si aun no lo ha usado.
 */
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
 * El proyecto Personal de una persona, creandolo la primera vez que se usa
 * (ADR 051).
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

    // Con el nombre de la persona, y no solo «Personal»: sus tareas salen en
    // las pantallas de los demas, y si la persona se va, el proyecto que
    // queda tiene que decir de quien era. A su dueño la barra lo llama
    // «Personal», sin mas.
    return insertProject(tx, {
      workspaceId,
      ownerUserId: userId,
      name: owner?.name ? `Personal de ${owner.name}` : "Personal",
      icon: "UserRound",
      slug: INBOX_SLUG,
    });
  });
}
