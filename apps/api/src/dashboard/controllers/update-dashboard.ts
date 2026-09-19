import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { dashboardTable } from "../../database/schema";

export default async function updateDashboard(
  id: string,
  data: { name?: string; position?: number; isShared?: boolean },
) {
  const [dashboard] = await db
    .update(dashboardTable)
    .set({
      ...(data.name !== undefined && { name: data.name }),
      ...(data.position !== undefined && { position: data.position }),
      ...(data.isShared !== undefined && { isShared: data.isShared }),
    })
    .where(eq(dashboardTable.id, id))
    .returning();

  if (!dashboard) {
    throw new HTTPException(404, { message: "Dashboard not found" });
  }

  return dashboard;
}
