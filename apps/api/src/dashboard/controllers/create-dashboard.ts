import { and, count, eq } from "drizzle-orm";
import db from "../../database";
import { dashboardTable } from "../../database/schema";

export default async function createDashboard({
  workspaceId,
  userId,
  name,
}: {
  workspaceId: string;
  userId: string;
  name: string;
}) {
  const [existing] = await db
    .select({ value: count() })
    .from(dashboardTable)
    .where(
      and(
        eq(dashboardTable.workspaceId, workspaceId),
        eq(dashboardTable.createdBy, userId),
      ),
    );

  const [dashboard] = await db
    .insert(dashboardTable)
    .values({
      workspaceId,
      createdBy: userId,
      name,
      position: existing?.value ?? 0,
    })
    .returning();

  return dashboard;
}
