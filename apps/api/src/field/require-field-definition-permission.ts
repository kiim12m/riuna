import { eq } from "drizzle-orm";
import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import db from "../database";
import { fieldDefinitionTable } from "../database/schema";
import { hasWorkspacePermission } from "../utils/require-workspace-permission";

/**
 * En `PATCH /:id` y `DELETE /:id` el alcance del campo no esta en la URL, asi
 * que el permiso que hay que exigir depende de la fila: `project:update` para
 * un campo de proyecto y `workspace:manage_settings` para uno que afecta a
 * todos los proyectos a la vez.
 *
 * Es la diferencia con las epicas, que siempre cuelgan de un proyecto y por
 * eso pueden fijar el permiso en la ruta.
 */
export async function requireFieldDefinitionPermission(c: Context, next: Next) {
  const id = c.req.param("id");

  if (!id) {
    throw new HTTPException(400, {
      message: "Field definition id is required",
    });
  }

  const [definition] = await db
    .select({ projectId: fieldDefinitionTable.projectId })
    .from(fieldDefinitionTable)
    .where(eq(fieldDefinitionTable.id, id))
    .limit(1);

  if (!definition) {
    throw new HTTPException(404, { message: "Field definition not found" });
  }

  // Anotado a mano: sin el tipo, TypeScript une las dos ramas en un objeto con
  // las dos claves opcionales y deja de encajar en `PermissionMap`.
  const required: Record<string, string[]> = definition.projectId
    ? { project: ["update"] }
    : { workspace: ["manage_settings"] };

  if (!(await hasWorkspacePermission(c, required))) {
    if (!c.get("userId")) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }
    throw new HTTPException(403, { message: "Insufficient permissions" });
  }

  return next();
}
