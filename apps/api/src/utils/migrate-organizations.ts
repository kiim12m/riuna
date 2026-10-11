import { eq } from "drizzle-orm";
import { auth } from "../auth";
import db, { schema } from "../database";
import { log } from "./log";

async function migrateOrganizations() {
  log.info("Migrating organizations...");

  const workspaces = await db.select().from(schema.workspaceTable);

  for (const workspace of workspaces) {
    const members = await db
      .select()
      .from(schema.workspaceUserTable)
      .where(eq(schema.workspaceUserTable.workspaceId, workspace.id));

    const owner = members.find((member) => member.role === "owner");

    const data = await auth.api.createOrganization({
      body: {
        name: workspace.name,
        description: workspace.description || undefined,
        slug:
          workspace.slug || workspace.name.toLowerCase().replace(/\s+/g, "-"),
        userId: owner?.userId,
      },
    });

    // now we need to migrate the members
    for (const member of members) {
      await auth.api.addTeamMember({
        body: {
          teamId: data?.id || "",
          userId: member.userId,
        },
        headers: new Headers(),
      });
    }
  }
}

export default migrateOrganizations;
