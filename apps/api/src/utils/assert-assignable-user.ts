import { and, eq, inArray } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db, { schema } from "../database";
import type { DbOrTx } from "../task/controllers/assignees";

const NOT_ASSIGNABLE = "Assignee is not a member of this workspace";

export async function filterAssignableUsers(
  userIds: string[],
  workspaceId: string,
  dbOrTx: DbOrTx = db,
): Promise<Set<string>> {
  if (userIds.length === 0) {
    return new Set();
  }

  const memberships = await dbOrTx
    .select({ userId: schema.workspaceUserTable.userId })
    .from(schema.workspaceUserTable)
    .where(
      and(
        inArray(schema.workspaceUserTable.userId, userIds),
        eq(schema.workspaceUserTable.workspaceId, workspaceId),
      ),
    );

  const assignable = new Set(memberships.map((row) => row.userId));
  const remaining = userIds.filter((id) => !assignable.has(id));

  if (remaining.length === 0) {
    return assignable;
  }

  const admins = await dbOrTx
    .select({ id: schema.userTable.id })
    .from(schema.userTable)
    .where(
      and(
        inArray(schema.userTable.id, remaining),
        eq(schema.userTable.role, "admin"),
      ),
    );

  for (const admin of admins) {
    assignable.add(admin.id);
  }

  return assignable;
}

export async function assertAssignableUser(
  userId: string,
  workspaceId: string,
  dbOrTx: DbOrTx = db,
): Promise<void> {
  const assignable = await filterAssignableUsers([userId], workspaceId, dbOrTx);

  if (!assignable.has(userId)) {
    throw new HTTPException(403, { message: NOT_ASSIGNABLE });
  }
}

export async function getProjectWorkspaceId(
  projectId: string,
  dbOrTx: DbOrTx = db,
): Promise<string> {
  const [project] = await dbOrTx
    .select({ workspaceId: schema.projectTable.workspaceId })
    .from(schema.projectTable)
    .where(eq(schema.projectTable.id, projectId))
    .limit(1);

  if (!project) {
    throw new HTTPException(404, { message: "Project not found" });
  }

  return project.workspaceId;
}
