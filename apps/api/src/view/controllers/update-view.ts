import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { viewTable } from "../../database/schema";

async function updateView({
  id,
  name,
  config,
  isShared,
  position,
  archived,
}: {
  id: string;
  name?: string;
  config?: Record<string, unknown>;
  isShared?: boolean;
  position?: number;
  archived?: boolean;
}) {
  const values: Partial<typeof viewTable.$inferInsert> = {};

  if (name !== undefined) {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new HTTPException(400, { message: "View name is required" });
    }
    values.name = trimmed;
  }

  // El tipo no cambia: una vista de tabla guardada con columnas y un modo de
  // jerarquia no significa nada en un calendario.
  if (config !== undefined) values.config = config;
  if (isShared !== undefined) values.isShared = isShared;
  if (position !== undefined) values.position = position;
  if (archived !== undefined) values.archivedAt = archived ? new Date() : null;

  if (Object.keys(values).length === 0) {
    const existing = await db.query.viewTable.findFirst({
      where: eq(viewTable.id, id),
    });
    if (!existing) throw new HTTPException(404, { message: "View not found" });
    return existing;
  }

  const [updated] = await db
    .update(viewTable)
    .set(values)
    .where(eq(viewTable.id, id))
    .returning();

  if (!updated) {
    throw new HTTPException(404, { message: "View not found" });
  }

  return updated;
}

export default updateView;
