import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { epicTable } from "../../database/schema";
import { publishEvent } from "../../events";

// Borrado real, no archivado: archivar ya existe como `archived_at` y es lo
// que ofrece la interfaz por defecto. Esto es para deshacer una epica creada
// por error, y las tareas sobreviven —solo cae su pertenencia, por la cascada
// de `task_epic`.
async function deleteEpic(epicId: string, currentUserId: string) {
  const [epic] = await db
    .delete(epicTable)
    .where(eq(epicTable.id, epicId))
    .returning();

  if (!epic) {
    throw new HTTPException(404, { message: "Epic not found" });
  }

  await publishEvent("epic.changed", {
    projectId: epic.projectId,
    epicId: epic.id,
    userId: currentUserId,
  });

  return epic;
}

export default deleteEpic;
