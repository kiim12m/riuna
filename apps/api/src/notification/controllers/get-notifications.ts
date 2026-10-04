import { and, count, desc, eq, lt } from "drizzle-orm";
import db from "../../database";
import {
  notificationTable,
  projectTable,
  taskTable,
  workspaceTable,
} from "../../database/schema";

export const DEFAULT_NOTIFICATIONS_PAGE = 50;
export const MAX_NOTIFICATIONS_PAGE = 100;

type NotificationQuery = {
  /** Cuantas devolver, de 1 a 100. Sin dato, 50: lo de siempre. */
  limit?: number;
  /** Solo las anteriores a este instante: la pagina siguiente empieza donde acabo la actual. */
  before?: Date;
  /** Solo las no leidas. */
  unread?: boolean;
};

/**
 * Las notificaciones de una persona, de la mas reciente a la mas antigua.
 *
 * Sin parametros devuelve las 50 de siempre. La paginacion es por cursor de
 * fecha (`before`) y no por desplazamiento: se crean y se borran sin parar, y
 * un `OFFSET` saltaria o repetiria filas entre una pagina y la siguiente. Dos
 * notificaciones del mismo milisegundo para la misma persona podrian caer a
 * ambos lados del corte; en la practica solo ocurre con avisos en rafaga.
 */
async function getNotifications(
  userId: string,
  { limit, before, unread }: NotificationQuery = {},
) {
  const conditions = [eq(notificationTable.userId, userId)];
  if (before) conditions.push(lt(notificationTable.createdAt, before));
  if (unread) conditions.push(eq(notificationTable.isRead, false));

  const rows = await db
    .select({
      notification: notificationTable,
      projectId: projectTable.id,
      workspaceId: workspaceTable.id,
    })
    .from(notificationTable)
    .leftJoin(
      taskTable,
      and(
        eq(notificationTable.resourceId, taskTable.id),
        eq(notificationTable.resourceType, "task"),
      ),
    )
    .leftJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .leftJoin(workspaceTable, eq(projectTable.workspaceId, workspaceTable.id))
    .where(and(...conditions))
    .orderBy(desc(notificationTable.createdAt))
    .limit(
      Math.min(
        Math.max(limit ?? DEFAULT_NOTIFICATIONS_PAGE, 1),
        MAX_NOTIFICATIONS_PAGE,
      ),
    );

  return rows.map(({ notification, projectId, workspaceId }) => {
    if (!projectId && !workspaceId) {
      return notification;
    }

    const existing =
      notification.eventData &&
      typeof notification.eventData === "object" &&
      !Array.isArray(notification.eventData)
        ? (notification.eventData as Record<string, unknown>)
        : {};

    return {
      ...notification,
      eventData: {
        ...existing,
        projectId: projectId ?? existing.projectId ?? null,
        workspaceId: workspaceId ?? existing.workspaceId ?? null,
      },
    };
  });
}

/** Cuantas sin leer tiene, todas, no solo las de la primera pagina. */
export async function getUnreadNotificationCount(userId: string) {
  const [row] = await db
    .select({ total: count() })
    .from(notificationTable)
    .where(
      and(
        eq(notificationTable.userId, userId),
        eq(notificationTable.isRead, false),
      ),
    );
  return row?.total ?? 0;
}

export default getNotifications;
