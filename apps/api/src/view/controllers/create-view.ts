import { and, eq, isNull, max } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { viewTable } from "../../database/schema";
import { publishEvent } from "../../events";

const VIEW_TYPES = [
  "table",
  "board",
  "list",
  "calendar",
  "gantt",
  "portfolio",
] as const;
export type ViewType = (typeof VIEW_TYPES)[number];

async function createView({
  workspaceId,
  projectId,
  name,
  type,
  config,
  isShared,
  currentUserId,
}: {
  workspaceId: string;
  projectId: string | null;
  name: string;
  type: ViewType;
  config?: Record<string, unknown>;
  isShared?: boolean;
  currentUserId: string;
}) {
  const trimmed = name.trim();

  if (!trimmed) {
    throw new HTTPException(400, { message: "View name is required" });
  }

  // La cartera (ADR 088) mira todos los proyectos: no es de ninguno.
  if (type === "portfolio" && projectId) {
    throw new HTTPException(400, {
      message: "A portfolio view belongs to the workspace, not to a project",
    });
  }

  const scope = projectId
    ? eq(viewTable.projectId, projectId)
    : and(eq(viewTable.workspaceId, workspaceId), isNull(viewTable.projectId));

  const [row] = await db
    .select({ maxPosition: max(viewTable.position) })
    .from(viewTable)
    .where(scope);

  const [view] = await db
    .insert(viewTable)
    .values({
      workspaceId,
      projectId,
      createdBy: currentUserId,
      name: trimmed,
      type,
      config: config ?? {},
      isShared: isShared ?? false,
      position: (row?.maxPosition ?? 0) + 1,
    })
    .returning();

  if (!view) {
    throw new HTTPException(500, { message: "Failed to create view" });
  }

  // Una vista compartida es estado visible para el resto del espacio: sin este
  // evento, quien la comparte se la tiene que anunciar por chat, porque
  // `["views", projectId]` no tiene refresco automatico y el cliente global
  // lleva `refetchOnMount:false`.
  await publishEvent("view.changed", {
    workspaceId: view.workspaceId,
    projectId: view.projectId,
    viewId: view.id,
    userId: view.createdBy,
    isShared: view.isShared,
  });

  return view;
}

export default createView;
