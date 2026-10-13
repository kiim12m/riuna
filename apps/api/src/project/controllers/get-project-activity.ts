import { desc, eq } from "drizzle-orm";
import db from "../../database";
import { projectActivityTable, userTable } from "../../database/schema";

/** La historia del estado de un proyecto (ADR 087), lo mas reciente primero. */
async function getProjectActivity(projectId: string, limit = 50) {
  return db
    .select({
      id: projectActivityTable.id,
      type: projectActivityTable.type,
      eventData: projectActivityTable.eventData,
      createdAt: projectActivityTable.createdAt,
      userId: projectActivityTable.userId,
      userName: userTable.name,
      userImage: userTable.image,
    })
    .from(projectActivityTable)
    .leftJoin(userTable, eq(projectActivityTable.userId, userTable.id))
    .where(eq(projectActivityTable.projectId, projectId))
    .orderBy(
      desc(projectActivityTable.createdAt),
      desc(projectActivityTable.id),
    )
    .limit(limit);
}

export default getProjectActivity;
