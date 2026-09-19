import { eq } from "drizzle-orm";
import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import db from "../database";
import { dashboardTable, dashboardWidgetTable } from "../database/schema";
import { hasWorkspacePermission } from "../utils/require-workspace-permission";

/**
 * Un panel es de quien lo crea.
 *
 * Se gobierna por propiedad y no por el vocabulario de permisos, igual que las
 * vistas (ADR 015): un panel no cambia ninguna tarea, solo dice como mirarlas.
 * Y **no se anade un recurso `dashboard` a `@riuna/permissions`** a proposito:
 * toda fila de `workspace_role` ya guardada carece de ese recurso, asi que
 * `satisfies()` devolveria falso y cada espacio con roles personalizados se
 * quedaria con un 403 el dia del despliegue.
 *
 * Desde la rebanada 2 un panel se puede **compartir** con el espacio. La lectura
 * pasa entonces a ser "propios mas compartidos" y la escritura sigue siendo de
 * quien lo creo — o de un administrador del espacio, que es quien puede retirar
 * algo compartido que estorbe.
 */
export async function requireDashboardOwner(c: Context, next: Next) {
  const id = c.req.param("id");

  if (!id) {
    throw new HTTPException(400, { message: "Dashboard id is required" });
  }

  const [dashboard] = await db
    .select({
      createdBy: dashboardTable.createdBy,
      isShared: dashboardTable.isShared,
    })
    .from(dashboardTable)
    .where(eq(dashboardTable.id, id))
    .limit(1);

  if (!dashboard) {
    throw new HTTPException(404, { message: "Dashboard not found" });
  }

  return assertOwner(c, next, dashboard.createdBy, dashboard.isShared);
}

/** Lo mismo para una ruta que nombra el widget y no el panel. */
export async function requireWidgetOwner(c: Context, next: Next) {
  const id = c.req.param("id");

  if (!id) {
    throw new HTTPException(400, { message: "Widget id is required" });
  }

  const [widget] = await db
    .select({
      createdBy: dashboardTable.createdBy,
      isShared: dashboardTable.isShared,
    })
    .from(dashboardWidgetTable)
    .innerJoin(
      dashboardTable,
      eq(dashboardWidgetTable.dashboardId, dashboardTable.id),
    )
    .where(eq(dashboardWidgetTable.id, id))
    .limit(1);

  if (!widget) {
    throw new HTTPException(404, { message: "Widget not found" });
  }

  return assertOwner(c, next, widget.createdBy, widget.isShared);
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
      message: "Only the person who created this dashboard can change it",
    });
  }

  return next();
}

/**
 * Leer un panel: su dueño, o cualquiera del espacio si esta compartido.
 *
 * Va aparte del gate de escritura a proposito. Al anadir el compartir se me paso
 * que `/:id/data` seguia pidiendo propiedad, asi que un panel compartido se
 * pintaba con **todos** los widgets en 403: la lista lo devolvia y sus datos no.
 * Compartir algo que no se puede leer no es compartirlo.
 */
export async function requireDashboardVisible(c: Context, next: Next) {
  const id = c.req.param("id");

  if (!id) {
    throw new HTTPException(400, { message: "Dashboard id is required" });
  }

  const [dashboard] = await db
    .select({
      createdBy: dashboardTable.createdBy,
      isShared: dashboardTable.isShared,
    })
    .from(dashboardTable)
    .where(eq(dashboardTable.id, id))
    .limit(1);

  if (!dashboard) {
    throw new HTTPException(404, { message: "Dashboard not found" });
  }

  const userId = c.get("userId");

  if (!userId) {
    throw new HTTPException(401, { message: "Unauthorized" });
  }

  if (dashboard.isShared || dashboard.createdBy === userId) {
    return next();
  }

  throw new HTTPException(403, {
    message: "This dashboard belongs to someone else",
  });
}
