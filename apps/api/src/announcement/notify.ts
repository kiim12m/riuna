import { eq } from "drizzle-orm";
import db from "../database";
import { userTable, workspaceUserTable } from "../database/schema";
import { subscribeToEvent } from "../events";
import createNotification from "../notification/controllers/create-notification";
import { log } from "../utils/log";
import { announcementSummaries } from "./announcements";

type PublishedEvent = {
  announcementId: string;
  workspaceId: string;
  projectId: string | null;
  userId: string;
};

/**
 * Publicar un aviso con «avisar a los miembros» (ADR 081) lo manda a todo el
 * espacio menos a quien lo escribe: los proyectos de un espacio los ve todo
 * el. Por la campana y por los canales de cada uno, con sus reglas.
 */
export async function notifyAnnouncement(data: PublishedEvent) {
  const [summary] = await announcementSummaries([data.announcementId]);
  if (!summary) return;

  const [members, [author]] = await Promise.all([
    db
      .selectDistinct({ userId: workspaceUserTable.userId })
      .from(workspaceUserTable)
      .where(eq(workspaceUserTable.workspaceId, data.workspaceId)),
    db
      .select({ name: userTable.name })
      .from(userTable)
      .where(eq(userTable.id, data.userId))
      .limit(1),
  ]);

  for (const { userId } of members) {
    if (userId === data.userId) continue;
    try {
      await createNotification({
        userId,
        type: "announcement_published",
        eventData: {
          announcementTitle: summary.title,
          projectId: summary.projectId,
          projectName: summary.projectName,
          workspaceId: summary.workspaceId,
          authorName: author?.name ?? null,
        },
        resourceId: summary.id,
        resourceType: "announcement",
      });
    } catch (error) {
      log.error("Failed to notify an announcement", {
        announcementId: summary.id,
        userId,
        error,
      });
    }
  }
}

void subscribeToEvent<PublishedEvent>(
  "announcement.published",
  notifyAnnouncement,
);
