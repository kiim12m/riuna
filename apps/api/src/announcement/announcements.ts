import { and, desc, eq, gt, inArray, isNull, or, type SQL } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../database";
import { announcementTable, projectTable, userTable } from "../database/schema";
import { publishEvent } from "../events";

/**
 * Avisos de proyecto y de espacio (ADR 081): un tablon de anuncios con el
 * editor de siempre, que se puede fijar como franja en las vistas del
 * proyecto y que avisa a los miembros al publicarse.
 */

const LIST_LIMIT = 50;

export type AnnouncementInput = {
  title: string;
  content: string;
  pinned: boolean;
  pinnedUntil: Date | null;
};

type Row = typeof announcementTable.$inferSelect & {
  authorName: string | null;
  authorImage: string | null;
};

/** Fijado y sin caducar: lo que sale como franja. */
function pinnedNow(now = new Date()): SQL {
  return and(
    eq(announcementTable.pinned, true),
    or(
      isNull(announcementTable.pinnedUntil),
      gt(announcementTable.pinnedUntil, now),
    ),
  ) as SQL;
}

function serialize(row: Row, now = new Date()) {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    title: row.title,
    content: row.content,
    pinned: row.pinned,
    pinnedUntil: row.pinnedUntil?.toISOString() ?? null,
    pinnedNow:
      row.pinned &&
      (!row.pinnedUntil || row.pinnedUntil.getTime() > now.getTime()),
    notified: row.notified,
    author: row.authorId
      ? { id: row.authorId, name: row.authorName, image: row.authorImage }
      : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export type Announcement = ReturnType<typeof serialize>;

function selectRows(where: SQL | undefined) {
  return db
    .select({
      id: announcementTable.id,
      workspaceId: announcementTable.workspaceId,
      projectId: announcementTable.projectId,
      title: announcementTable.title,
      content: announcementTable.content,
      pinned: announcementTable.pinned,
      pinnedUntil: announcementTable.pinnedUntil,
      notified: announcementTable.notified,
      authorId: announcementTable.authorId,
      createdAt: announcementTable.createdAt,
      updatedAt: announcementTable.updatedAt,
      authorName: userTable.name,
      authorImage: userTable.image,
    })
    .from(announcementTable)
    .leftJoin(userTable, eq(announcementTable.authorId, userTable.id))
    .where(where);
}

/**
 * Los de un proyecto, o los del espacio (`projectId` nulo). Primero los
 * fijados que siguen vigentes, luego del mas nuevo al mas viejo.
 */
export async function listAnnouncements(
  workspaceId: string,
  projectId: string | null,
) {
  const rows = await selectRows(
    and(
      eq(announcementTable.workspaceId, workspaceId),
      projectId
        ? eq(announcementTable.projectId, projectId)
        : isNull(announcementTable.projectId),
    ),
  )
    .orderBy(desc(announcementTable.createdAt))
    .limit(LIST_LIMIT);

  const now = new Date();
  const list = rows.map((row) => serialize(row as Row, now));
  return [
    ...list.filter((item) => item.pinnedNow),
    ...list.filter((item) => !item.pinnedNow),
  ];
}

/**
 * La franja de las vistas de un proyecto: el fijado vigente mas reciente,
 * suyo o del espacio.
 */
export async function pinnedForProject(workspaceId: string, projectId: string) {
  const [row] = await selectRows(
    and(
      eq(announcementTable.workspaceId, workspaceId),
      or(
        eq(announcementTable.projectId, projectId),
        isNull(announcementTable.projectId),
      ),
      pinnedNow(),
    ),
  )
    .orderBy(desc(announcementTable.createdAt))
    .limit(1);

  return row ? serialize(row as Row) : null;
}

async function loadOne(id: string) {
  const [row] = await selectRows(eq(announcementTable.id, id)).limit(1);
  if (!row) throw new HTTPException(404, { message: "Announcement not found" });
  return serialize(row as Row);
}

/** El proyecto donde se publica: del espacio, y no «Personal». */
export async function assertAnnounceableProject(
  workspaceId: string,
  projectId: string,
) {
  const [project] = await db
    .select({ ownerUserId: projectTable.ownerUserId })
    .from(projectTable)
    .where(
      and(
        eq(projectTable.id, projectId),
        eq(projectTable.workspaceId, workspaceId),
      ),
    )
    .limit(1);
  if (!project) throw new HTTPException(404, { message: "Project not found" });
  if (project.ownerUserId) {
    throw new HTTPException(400, {
      message: "A personal project has no announcements",
    });
  }
}

async function announceChanged(workspaceId: string, projectId: string | null) {
  await publishEvent("announcement.changed", { workspaceId, projectId });
}

export async function createAnnouncement({
  workspaceId,
  projectId,
  authorId,
  input,
  notify,
}: {
  workspaceId: string;
  projectId: string | null;
  authorId: string;
  input: AnnouncementInput;
  notify: boolean;
}) {
  const [row] = await db
    .insert(announcementTable)
    .values({
      workspaceId,
      projectId,
      authorId,
      notified: notify,
      ...input,
    })
    .returning({ id: announcementTable.id });
  if (!row) throw new Error("Failed to create the announcement");

  await announceChanged(workspaceId, projectId);
  if (notify) {
    await publishEvent("announcement.published", {
      announcementId: row.id,
      workspaceId,
      projectId,
      userId: authorId,
    });
  }
  return loadOne(row.id);
}

export async function getAnnouncementScope(id: string) {
  const [row] = await db
    .select({
      workspaceId: announcementTable.workspaceId,
      projectId: announcementTable.projectId,
    })
    .from(announcementTable)
    .where(eq(announcementTable.id, id))
    .limit(1);
  if (!row) throw new HTTPException(404, { message: "Announcement not found" });
  return row;
}

/** Editar no vuelve a avisar: el aviso ya llego cuando se publico. */
export async function updateAnnouncement(id: string, input: AnnouncementInput) {
  const [row] = await db
    .update(announcementTable)
    .set(input)
    .where(eq(announcementTable.id, id))
    .returning({
      workspaceId: announcementTable.workspaceId,
      projectId: announcementTable.projectId,
    });
  if (!row) throw new HTTPException(404, { message: "Announcement not found" });
  await announceChanged(row.workspaceId, row.projectId);
  return loadOne(id);
}

export async function deleteAnnouncement(id: string) {
  const [row] = await db
    .delete(announcementTable)
    .where(eq(announcementTable.id, id))
    .returning({
      workspaceId: announcementTable.workspaceId,
      projectId: announcementTable.projectId,
    });
  if (!row) throw new HTTPException(404, { message: "Announcement not found" });
  await announceChanged(row.workspaceId, row.projectId);
}

/** El titulo y el proyecto de unos avisos, para el texto de la notificacion. */
export async function announcementSummaries(ids: string[]) {
  if (ids.length === 0) return [];
  return db
    .select({
      id: announcementTable.id,
      title: announcementTable.title,
      workspaceId: announcementTable.workspaceId,
      projectId: announcementTable.projectId,
      projectName: projectTable.name,
    })
    .from(announcementTable)
    .leftJoin(projectTable, eq(announcementTable.projectId, projectTable.id))
    .where(inArray(announcementTable.id, ids));
}
