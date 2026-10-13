import { eq } from "drizzle-orm";
import db from "../database";
import {
  projectActivityTable,
  userTable,
  workspaceUserTable,
} from "../database/schema";
import { subscribeToEvent } from "../events";
import createNotification from "../notification/controllers/create-notification";
import { log } from "../utils/log";

export type ProjectStatusChanged = {
  projectId: string;
  workspaceId: string;
  userId: string;
  projectName: string;
  health?: { from: string; to: string; note: string | null };
  dates?: {
    from: { start: string | null; end: string | null };
    to: { start: string | null; end: string | null };
  };
  lead?: { from: string | null; to: string | null };
  notify: boolean;
};

/** Cada cambio del estado, una fila en la actividad del proyecto (ADR 087). */
export async function recordProjectStatus(data: ProjectStatusChanged) {
  const rows = [
    data.health && { type: "health_changed", eventData: data.health },
    data.dates && { type: "dates_changed", eventData: data.dates },
    data.lead && { type: "lead_changed", eventData: data.lead },
  ].filter((row) => Boolean(row)) as Array<{
    type: string;
    eventData: Record<string, unknown>;
  }>;
  if (rows.length === 0) return;

  await db.insert(projectActivityTable).values(
    rows.map((row) => ({
      projectId: data.projectId,
      userId: data.userId,
      ...row,
    })),
  );
}

/**
 * «Avisar a los miembros» al cambiar la salud: a todo el espacio menos a quien
 * la cambia, como un aviso de la ADR 081, porque los proyectos de un espacio
 * los ve todo el.
 */
export async function notifyProjectHealth(data: ProjectStatusChanged) {
  if (!data.notify || !data.health) return;

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
        type: "project_health_changed",
        eventData: {
          workspaceId: data.workspaceId,
          projectId: data.projectId,
          projectName: data.projectName,
          health: data.health.to,
          note: data.health.note,
          authorName: author?.name ?? null,
        },
        resourceId: data.projectId,
        resourceType: "project",
      });
    } catch (error) {
      log.error("Failed to notify a project health change", {
        projectId: data.projectId,
        userId,
        error,
      });
    }
  }
}

// Entrar o salir de un proyecto padre (ADR 089), en la actividad del hijo.
void subscribeToEvent<{
  projectId: string;
  userId: string;
  from: string | null;
  to: string | null;
}>("project.parent_changed", async (data) => {
  await db.insert(projectActivityTable).values({
    projectId: data.projectId,
    userId: data.userId,
    type: "parent_changed",
    eventData: { from: data.from, to: data.to },
  });
});

// Los campos de proyecto (ADR 088) tambien dejan rastro en su actividad.
void subscribeToEvent<{
  projectId: string;
  userId: string;
  changes: Array<Record<string, unknown>>;
}>("project.fields_changed", async (data) => {
  await db.insert(projectActivityTable).values({
    projectId: data.projectId,
    userId: data.userId,
    type: "fields_changed",
    eventData: { changes: data.changes },
  });
});

void subscribeToEvent<ProjectStatusChanged>(
  "project.status_changed",
  async (data) => {
    await recordProjectStatus(data);
    await notifyProjectHealth(data);
  },
);
