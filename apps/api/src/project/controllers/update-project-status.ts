import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { projectTable, workspaceUserTable } from "../../database/schema";
import { publishEvent } from "../../events";

export const PROJECT_HEALTHS = [
  "not_started",
  "on_track",
  "at_risk",
  "off_track",
  "finished",
  "cancelled",
] as const;
export type ProjectHealth = (typeof PROJECT_HEALTHS)[number];

export type ProjectStatusInput = {
  health?: ProjectHealth;
  /** Vacia o nula, sin nota. */
  note?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
  leadUserId?: string | null;
};

const time = (date: Date | null) => date?.getTime() ?? null;
const iso = (date: Date | null) => date?.toISOString() ?? null;

/**
 * El estado de un proyecto (ADR 087): su salud con una nota, sus fechas y su
 * responsable. Solo se escribe lo que llega, y cada cambio deja su rastro en
 * la actividad del proyecto. `notify` avisa al espacio, pero solo si cambia la
 * salud: retocar una fecha no es noticia.
 */
async function updateProjectStatus({
  projectId,
  workspaceId,
  userId,
  input,
  notify = false,
}: {
  projectId: string;
  workspaceId: string;
  userId: string;
  input: ProjectStatusInput;
  notify?: boolean;
}) {
  const [project] = await db
    .select()
    .from(projectTable)
    .where(
      and(
        eq(projectTable.id, projectId),
        eq(projectTable.workspaceId, workspaceId),
      ),
    )
    .limit(1);
  if (!project) throw new HTTPException(404, { message: "Project not found" });
  // La Bandeja de una persona (ADR 051) no es un proyecto que se gestione.
  if (project.ownerUserId) {
    throw new HTTPException(400, {
      message: "A personal project has no status",
    });
  }

  if (input.leadUserId) {
    const [member] = await db
      .select({ userId: workspaceUserTable.userId })
      .from(workspaceUserTable)
      .where(
        and(
          eq(workspaceUserTable.workspaceId, workspaceId),
          eq(workspaceUserTable.userId, input.leadUserId),
        ),
      )
      .limit(1);
    if (!member) {
      throw new HTTPException(400, {
        message: "The lead must be a member of the workspace",
      });
    }
  }

  const next = {
    health: input.health ?? (project.health as ProjectHealth),
    healthNote:
      input.note === undefined
        ? project.healthNote
        : input.note?.trim() || null,
    startDate:
      input.startDate === undefined ? project.startDate : input.startDate,
    endDate: input.endDate === undefined ? project.endDate : input.endDate,
    leadUserId:
      input.leadUserId === undefined ? project.leadUserId : input.leadUserId,
  };
  if (next.startDate && next.endDate && next.endDate < next.startDate) {
    throw new HTTPException(400, {
      message: "The end date cannot be before the start date",
    });
  }

  const healthChanged =
    next.health !== project.health || next.healthNote !== project.healthNote;
  const datesChanged =
    time(next.startDate) !== time(project.startDate) ||
    time(next.endDate) !== time(project.endDate);
  const leadChanged = next.leadUserId !== project.leadUserId;
  if (!healthChanged && !datesChanged && !leadChanged) return project;

  const [updated] = await db
    .update(projectTable)
    .set(next)
    .where(eq(projectTable.id, projectId))
    .returning();
  if (!updated) throw new Error("Failed to update the project status");

  await publishEvent("project.status_changed", {
    projectId,
    workspaceId,
    userId,
    projectName: project.name,
    ...(healthChanged
      ? {
          health: {
            from: project.health,
            to: next.health,
            note: next.healthNote,
          },
        }
      : {}),
    ...(datesChanged
      ? {
          dates: {
            from: { start: iso(project.startDate), end: iso(project.endDate) },
            to: { start: iso(next.startDate), end: iso(next.endDate) },
          },
        }
      : {}),
    ...(leadChanged
      ? { lead: { from: project.leadUserId, to: next.leadUserId } }
      : {}),
    notify: notify && next.health !== project.health,
  });

  return updated;
}

export default updateProjectStatus;
