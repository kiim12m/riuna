import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { dashboardTable } from "../../database/schema";

export default async function deleteDashboard(id: string) {
  // Los widgets se van en cascada con el panel: no tienen vida propia.
  const [dashboard] = await db
    .delete(dashboardTable)
    .where(eq(dashboardTable.id, id))
    .returning();

  if (!dashboard) {
    throw new HTTPException(404, { message: "Dashboard not found" });
  }

  return dashboard;
}
