import { randomUUID } from "node:crypto";
import db, { schema } from "../../../apps/api/src/database";
import { DEFAULT_PROJECT_COLUMNS } from "../../../apps/api/src/project/controllers/create-project";

export type SeededMemberContext = {
  user: typeof schema.userTable.$inferSelect;
  workspace: typeof schema.workspaceTable.$inferSelect;
};

export async function createWorkspaceMember(
  overrides?: Partial<{
    userName: string;
    workspaceName: string;
    role: string;
    // Un usuario que ya existe (p. ej. el de una sesion real), en vez de
    // fabricar uno nuevo.
    user: SeededMemberContext["user"];
  }>,
): Promise<SeededMemberContext> {
  const userId = `user-${randomUUID()}`;
  const workspaceId = `workspace-${randomUUID()}`;

  const user =
    overrides?.user ??
    (
      await db
        .insert(schema.userTable)
        .values({
          id: userId,
          email: `${userId}@example.com`,
          emailVerified: true,
          name: overrides?.userName || "Integration Test User",
        })
        .returning()
    )[0];

  const [workspace] = await db
    .insert(schema.workspaceTable)
    .values({
      id: workspaceId,
      createdAt: new Date(),
      name: overrides?.workspaceName || "Integration Test Workspace",
      slug: `workspace-${randomUUID()}`,
    })
    .returning();

  await db.insert(schema.workspaceUserTable).values({
    workspaceId: workspace.id,
    userId: user.id,
    role: overrides?.role ?? "member",
    joinedAt: new Date(),
  });

  return { user, workspace };
}

export async function createProjectFixture({
  workspaceId,
  name = "Integration Project",
  icon = "Folder",
  slug = `project-${randomUUID()}`,
}: {
  workspaceId: string;
  name?: string;
  icon?: string;
  slug?: string;
}) {
  const [project] = await db
    .insert(schema.projectTable)
    .values({
      workspaceId,
      name,
      icon,
      slug,
    })
    .returning();

  const insertedColumns: (typeof schema.columnTable.$inferSelect)[] = [];

  for (const col of DEFAULT_PROJECT_COLUMNS) {
    const [inserted] = await db
      .insert(schema.columnTable)
      .values({
        projectId: project.id,
        name: col.name,
        slug: col.slug,
        position: col.position,
        isFinal: col.isFinal,
      })
      .returning();
    if (inserted) {
      insertedColumns.push(inserted);
    }
  }

  const columnsBySlug = new Map(
    insertedColumns.map((column) => [column.slug, column]),
  );

  const todo = columnsBySlug.get("to-do");
  const inProgress = columnsBySlug.get("in-progress");
  const inReview = columnsBySlug.get("in-review");
  const done = columnsBySlug.get("done");

  if (!todo || !inProgress || !inReview || !done) {
    throw new Error("Failed to seed default project columns");
  }

  return {
    project,
    columns: {
      todo,
      inProgress,
      inReview,
      done,
    },
  };
}

/**
 * Los valores de arbol que toda tarea necesita desde la Fase 2. La base de
 * datos lo exige con dos CHECK (`task_path_ends_with_id`,
 * `task_depth_matches_path`), asi que un insert directo sin esto falla, que es
 * justamente lo que se buscaba al ponerlos.
 */
export function taskTreeValues(id = `task-${randomUUID()}`) {
  return { id, parentId: null, path: `/${id}/`, depth: 0 };
}

/** Los mismos valores para una tarea colgada de otra. */
export function childTreeValues(
  parent: { id: string; path: string; depth: number },
  id = `task-${randomUUID()}`,
) {
  return {
    id,
    parentId: parent.id,
    path: `${parent.path}${id}/`,
    depth: parent.depth + 1,
  };
}
