import { eq } from "drizzle-orm";
import db from "../database";
import { userTable } from "../database/schema";
import { roleHasWorkspacePermission } from "../utils/require-workspace-permission";
import { type Action, OUTBOUND_ACTIONS } from "./definition";

type PermissionMap = Record<string, string[]>;

/**
 * Lo que hace falta para gestionar una regla, y lo que quien la guardo tiene
 * que seguir teniendo para que corra (ADR 066).
 *
 * - De proyecto: `project:update`, lo mismo que las columnas y los campos.
 * - Si saca datos fuera (webhook o chat), ademas `workspace:manage_settings`,
 *   igual que configurar una integracion.
 * - De espacio: `workspace:manage_settings`, porque actua en todos los
 *   proyectos.
 */
export function requiredPermissions(
  projectId: string | null,
  actions: readonly Pick<Action, "type">[],
): PermissionMap {
  if (!projectId) return { workspace: ["manage_settings"] };

  const outbound = actions.some((action) =>
    OUTBOUND_ACTIONS.includes(action.type),
  );

  return outbound
    ? { project: ["update"], workspace: ["manage_settings"] }
    : { project: ["update"] };
}

/**
 * Si la persona en cuyo nombre actua una regla puede seguir haciendolo. Sin
 * peticion de por medio: es el rol, y el administrador de instancia, que
 * puede en cualquier espacio igual que en la interfaz.
 */
export async function actorCanRun(
  workspaceId: string,
  userId: string | null,
  permissions: PermissionMap,
): Promise<boolean> {
  if (!userId) return false;

  if (await roleHasWorkspacePermission(workspaceId, userId, permissions)) {
    return true;
  }

  const [user] = await db
    .select({ role: userTable.role })
    .from(userTable)
    .where(eq(userTable.id, userId))
    .limit(1);

  return user?.role === "admin";
}
