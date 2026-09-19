import { eq } from "drizzle-orm";
import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import db from "../database";
import { goalTable, goalTargetTable } from "../database/schema";
import { hasWorkspacePermission } from "../utils/require-workspace-permission";

/**
 * Un objetivo es de quien lo crea, por el mismo criterio que un panel y que una
 * vista (ADR 015): se gobierna por propiedad y **no** se anade un recurso
 * `goal` a `@riuna/permissions`, porque toda fila de `workspace_role` ya
 * guardada carece de el y `satisfies()` devolveria falso.
 *
 * Compartir con el equipo —que es lo que un OKR acaba pidiendo— llega con el
 * `is_shared` de la rebanada 2, a la vez para paneles y objetivos: es una
 * columna y un gate, no un modelo distinto.
 */
export async function requireGoalOwner(c: Context, next: Next) {
  const id = c.req.param("id");

  if (!id) {
    throw new HTTPException(400, { message: "Goal id is required" });
  }

  const [goal] = await db
    .select({
      createdBy: goalTable.createdBy,
      isShared: goalTable.isShared,
    })
    .from(goalTable)
    .where(eq(goalTable.id, id))
    .limit(1);

  if (!goal) {
    throw new HTTPException(404, { message: "Goal not found" });
  }

  return assertOwner(c, next, goal.createdBy, goal.isShared);
}

/** Lo mismo para una ruta que nombra el resultado clave y no el objetivo. */
export async function requireTargetOwner(c: Context, next: Next) {
  const id = c.req.param("id");

  if (!id) {
    throw new HTTPException(400, { message: "Key result id is required" });
  }

  const [target] = await db
    .select({
      createdBy: goalTable.createdBy,
      isShared: goalTable.isShared,
    })
    .from(goalTargetTable)
    .innerJoin(goalTable, eq(goalTargetTable.goalId, goalTable.id))
    .where(eq(goalTargetTable.id, id))
    .limit(1);

  if (!target) {
    throw new HTTPException(404, { message: "Key result not found" });
  }

  return assertOwner(c, next, target.createdBy, target.isShared);
}

async function assertOwner(
  c: Context,
  next: Next,
  createdBy: string,
  isShared: boolean,
) {
  const userId = c.get("userId");

  if (!userId) {
    throw new HTTPException(401, { message: "Unauthorized" });
  }

  if (createdBy !== userId) {
    // El administrador del espacio puede retirar algo **compartido** que
    // estorbe, aunque no sea suyo. Lo personal no: la rebanada 1 prometio que un
    // panel personal no lo toca nadie mas, y anadir el compartir no puede
    // convertir esa promesa en una excepcion para todo lo demas. Es un matiz
    // sobre el criterio de las vistas (ADR 015), que si son siempre moderables.
    if (
      isShared &&
      (await hasWorkspacePermission(c, { workspace: ["manage_settings"] }))
    ) {
      return next();
    }

    throw new HTTPException(403, {
      message: "Only the person who created this goal can change it",
    });
  }

  return next();
}
