import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { viewTable } from "../../database/schema";
import { publishEvent } from "../../events";

async function deleteView(id: string) {
  const [deleted] = await db
    .delete(viewTable)
    .where(eq(viewTable.id, id))
    .returning();

  if (!deleted) {
    throw new HTTPException(404, { message: "View not found" });
  }

  // Una vista compartida es estado visible para el resto del espacio: sin este
  // evento, quien la comparte se la tiene que anunciar por chat, porque
  // `["views", projectId]` no tiene refresco automatico y el cliente global
  // lleva `refetchOnMount:false`.
  await publishEvent("view.changed", {
    workspaceId: deleted.workspaceId,
    projectId: deleted.projectId,
    viewId: deleted.id,
    userId: deleted.createdBy,
    isShared: deleted.isShared,
  });

  return deleted;
}

export default deleteView;
