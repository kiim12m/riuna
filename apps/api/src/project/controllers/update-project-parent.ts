import { and, eq, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { projectTable } from "../../database/schema";
import { publishEvent } from "../../events";

/**
 * Hace de un proyecto un subproyecto de otro, o lo suelta (ADR 089). Un solo
 * nivel: el padre no puede tener padre y el hijo no puede tener hijos. La
 * Bandeja de una persona (ADR 051) no entra en el arbol.
 *
 * Bajo un cerrojo del espacio: dos peticiones a la vez —A bajo B y B bajo C—
 * pasarian cada una su comprobacion y dejarian dos niveles.
 */
async function updateProjectParent({
  projectId,
  workspaceId,
  parentId,
  userId,
}: {
  projectId: string;
  workspaceId: string;
  parentId: string | null;
  userId: string;
}) {
  const result = await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`project-tree:${workspaceId}`}))`,
    );

    const ids = parentId ? [projectId, parentId] : [projectId];
    const rows = await tx
      .select({
        id: projectTable.id,
        workspaceId: projectTable.workspaceId,
        parentId: projectTable.parentId,
        ownerUserId: projectTable.ownerUserId,
      })
      .from(projectTable)
      .where(sql`${projectTable.id} = ANY(${sql.param(ids)}::text[])`);
    const project = rows.find((row) => row.id === projectId);
    if (!project || project.workspaceId !== workspaceId) {
      throw new HTTPException(404, { message: "Project not found" });
    }
    if (project.parentId === parentId) return null;
    if (project.ownerUserId) {
      throw new HTTPException(400, {
        message: "A personal project cannot be part of another project",
      });
    }

    if (parentId) {
      const parent = rows.find((row) => row.id === parentId);
      if (!parent || parent.workspaceId !== workspaceId) {
        throw new HTTPException(400, {
          message: "The parent must be a project of the same workspace",
        });
      }
      if (parentId === projectId) {
        throw new HTTPException(400, {
          message: "A project cannot be its own parent",
        });
      }
      if (parent.ownerUserId) {
        throw new HTTPException(400, {
          message: "A personal project cannot have subprojects",
        });
      }
      if (parent.parentId) {
        throw new HTTPException(400, {
          message: "A subproject cannot have subprojects of its own",
        });
      }
      const [child] = await tx
        .select({ id: projectTable.id })
        .from(projectTable)
        .where(eq(projectTable.parentId, projectId))
        .limit(1);
      if (child) {
        throw new HTTPException(400, {
          message: "A project with subprojects cannot become a subproject",
        });
      }
    }

    const [updated] = await tx
      .update(projectTable)
      .set({ parentId })
      .where(
        and(
          eq(projectTable.id, projectId),
          eq(projectTable.workspaceId, workspaceId),
        ),
      )
      .returning();
    return { updated, previous: project.parentId };
  });

  if (!result) {
    const [project] = await db
      .select()
      .from(projectTable)
      .where(eq(projectTable.id, projectId));
    return project;
  }

  await publishEvent("project.parent_changed", {
    projectId,
    workspaceId,
    userId,
    from: result.previous,
    to: parentId,
  });
  return result.updated;
}

export default updateProjectParent;
