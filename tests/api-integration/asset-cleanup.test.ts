import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import {
  deleteOrphanedAssets,
  isAssetReferencedElsewhere,
} from "../../apps/api/src/storage/cleanup-assets";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
  taskTreeValues,
} from "./helpers/fixtures";

/**
 * La recoleccion de adjuntos huerfanos. Lo que vigila: un adjunto citado en un
 * **comentario** no se borra al quitarlo de la descripcion.
 *
 * Los comentarios son filas de `activity` con `type = 'comment'` y el cuerpo en
 * `content`; la tabla `comment` heredada no la escribe nadie. `cleanup-assets`
 * llego a consultar esa tabla vacia, lo que parecia cubrir el caso sin
 * cubrirlo. La consulta real es la de `activity`, y estas pruebas la fijan.
 */

const link = (id: string) => `<p><img src="/api/asset/${id}"></p>`;

async function seed() {
  const member = await createWorkspaceMember({ role: "admin" });
  const { project, columns } = await createProjectFixture({
    workspaceId: member.workspace.id,
  });

  const [task] = await db
    .insert(schema.taskTable)
    .values({
      ...taskTreeValues(),
      projectId: project.id,
      title: "Con adjuntos",
      status: "to-do",
      columnId: columns.todo.id,
      priority: "medium",
      number: 1,
      position: 1,
    })
    .returning();

  if (!task) throw new Error("failed to seed task");

  return {
    workspaceId: member.workspace.id,
    projectId: project.id,
    userId: member.user.id,
    taskId: task.id,
  };
}

async function addComment(taskId: string, userId: string, content: string) {
  await db.insert(schema.activityTable).values({
    taskId,
    type: "comment",
    userId,
    content,
  });
}

async function insertAsset(opts: {
  workspaceId: string;
  projectId: string;
  taskId: string;
  id: string;
}) {
  await db.insert(schema.assetTable).values({
    id: opts.id,
    workspaceId: opts.workspaceId,
    projectId: opts.projectId,
    taskId: opts.taskId,
    objectKey: `key-${opts.id}`,
    filename: `${opts.id}.png`,
    mimeType: "image/png",
    size: 1234,
  });
}

describe("API integration: orphaned asset cleanup", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("sees an asset referenced from the task description", async () => {
    const { taskId } = await seed();
    await db
      .update(schema.taskTable)
      .set({ description: link("A1") })
      .where(eq(schema.taskTable.id, taskId));

    expect(await isAssetReferencedElsewhere("A1", taskId)).toBe(true);
    expect(await isAssetReferencedElsewhere("A2", taskId)).toBe(false);
  });

  it("sees an asset referenced from a comment", async () => {
    const { taskId, userId } = await seed();
    await addComment(taskId, userId, `Mira esto ${link("B1")}`);

    expect(await isAssetReferencedElsewhere("B1", taskId)).toBe(true);
  });

  it("does not confuse a reference on another task", async () => {
    const first = await seed();
    const second = await seed();
    await addComment(second.taskId, second.userId, link("C1"));

    expect(await isAssetReferencedElsewhere("C1", first.taskId)).toBe(false);
    expect(await isAssetReferencedElsewhere("C1", second.taskId)).toBe(true);
  });

  it("keeps an asset dropped from the description while a comment still cites it", async () => {
    const { workspaceId, projectId, taskId, userId } = await seed();
    await insertAsset({ workspaceId, projectId, taskId, id: "D1" });
    await addComment(taskId, userId, `Adjunto en el hilo ${link("D1")}`);

    // La descripcion tenia el adjunto y deja de tenerlo.
    await deleteOrphanedAssets(link("D1"), "<p>sin nada</p>", { taskId });

    const [asset] = await db
      .select()
      .from(schema.assetTable)
      .where(eq(schema.assetTable.id, "D1"));

    expect(asset).toBeDefined();
  });
});
