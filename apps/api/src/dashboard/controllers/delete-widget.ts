import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { dashboardWidgetTable } from "../../database/schema";

export default async function deleteWidget(id: string) {
  const [widget] = await db
    .delete(dashboardWidgetTable)
    .where(eq(dashboardWidgetTable.id, id))
    .returning();

  if (!widget) {
    throw new HTTPException(404, { message: "Widget not found" });
  }

  return widget;
}
