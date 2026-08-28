import { eq } from "drizzle-orm";
import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import db from "../database";
import { viewTable } from "../database/schema";
import { hasWorkspacePermission } from "../utils/require-workspace-permission";

/**
 * Editar o borrar una vista es cosa de quien la creo, o de un administrador
 * del espacio.
 *
 * Se gobierna por propiedad y no por un permiso del vocabulario porque una
 * vista no cambia ninguna tarea: solo dice como mirarlas. Atarla a
 * `project:update` la dejaria fuera del alcance de un `member`, que es
 * justamente el problema que la Fase 3 descubrio con los campos
 * personalizados. Ver la ADR 015.
 */
export async function requireViewOwner(c: Context, next: Next) {
  const id = c.req.param("id");

  if (!id) {
    throw new HTTPException(400, { message: "View id is required" });
  }

  const [view] = await db
    .select({ createdBy: viewTable.createdBy })
    .from(viewTable)
    .where(eq(viewTable.id, id))
    .limit(1);

  if (!view) {
    throw new HTTPException(404, { message: "View not found" });
  }

  const userId = c.get("userId");

  if (!userId) {
    throw new HTTPException(401, { message: "Unauthorized" });
  }

  if (view.createdBy === userId) {
    return next();
  }

  // El administrador del espacio puede retirar una vista compartida que
  // estorbe, aunque no sea suya.
  if (await hasWorkspacePermission(c, { workspace: ["manage_settings"] })) {
    return next();
  }

  throw new HTTPException(403, {
    message: "Only the person who created this view can change it",
  });
}
