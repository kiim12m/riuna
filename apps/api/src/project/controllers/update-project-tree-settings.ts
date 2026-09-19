import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { projectTable } from "../../database/schema";
import { MAX_CONFIGURABLE_TASK_DEPTH } from "../../task/tree";

// Endpoint propio y no un campo mas de `updateProject` porque ese exige el
// objeto entero —nombre, icono, slug— y estos tres ajustes se cambian desde
// una pantalla que no conoce ninguno de ellos.
async function updateProjectTreeSettings({
  projectId,
  cascadeClose,
  cascadeArchive,
  maxTaskDepth,
}: {
  projectId: string;
  cascadeClose?: boolean;
  cascadeArchive?: boolean;
  maxTaskDepth?: number;
}) {
  if (
    maxTaskDepth !== undefined &&
    (maxTaskDepth < 1 || maxTaskDepth > MAX_CONFIGURABLE_TASK_DEPTH)
  ) {
    throw new HTTPException(400, {
      message: `Depth limit must be between 1 and ${MAX_CONFIGURABLE_TASK_DEPTH}`,
    });
  }

  const changes: Partial<typeof projectTable.$inferInsert> = {};
  if (cascadeClose !== undefined) changes.cascadeClose = cascadeClose;
  if (cascadeArchive !== undefined) changes.cascadeArchive = cascadeArchive;
  if (maxTaskDepth !== undefined) changes.maxTaskDepth = maxTaskDepth;

  if (Object.keys(changes).length === 0) {
    throw new HTTPException(400, { message: "Nothing to update" });
  }

  const [project] = await db
    .update(projectTable)
    .set(changes)
    .where(eq(projectTable.id, projectId))
    .returning();

  if (!project) {
    throw new HTTPException(404, { message: "Project not found" });
  }

  return project;
}

export default updateProjectTreeSettings;
