import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { viewTable } from "../../database/schema";

async function deleteView(id: string) {
  const [deleted] = await db
    .delete(viewTable)
    .where(eq(viewTable.id, id))
    .returning();

  if (!deleted) {
    throw new HTTPException(404, { message: "View not found" });
  }

  return deleted;
}

export default deleteView;
