import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
  taskTreeValues,
} from "./helpers/fixtures";

/**
 * `completed_at` lo mantiene un disparador que decide "final" leyendo
 * `column.is_final`. Cambiar esa bandera cambia la respuesta para tareas que ya
 * estan escritas, y hasta la Fase 7 nadie la releia: era el riesgo declarado de
 * la ADR 025. Con los paneles leyendola, una fecha obsoleta es una grafica que
 * miente, asi que `updateColumn` resella el proyecto entero.
 */
describe("API integration: re-stamping completed_at when is_final changes", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  async function seedTask(projectId: string, status: string, number: number) {
    const [task] = await db
      .insert(schema.taskTable)
      .values({
        ...taskTreeValues(),
        projectId,
        title: `Task ${number}`,
        status,
        number,
      })
      .returning();

    return task;
  }

  async function readCompletedAt(taskId: string) {
    const row = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, taskId),
    });

    return row?.completedAt ?? null;
  }

  it("stamps the tasks of a column that becomes final", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const { project, columns } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });

    const task = await seedTask(project.id, "in-review", 1);
    expect(await readCompletedAt(task.id)).toBeNull();

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request(`/api/column/${columns.inReview.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isFinal: true }),
    });

    expect(response.status).toBe(200);
    expect(await readCompletedAt(task.id)).toBeInstanceOf(Date);
  });

  it("clears the tasks of a column that stops being final", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const { project, columns } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    // Se marca "en revision" como final y se pone una tarea ahi, de modo que al
    // desmarcarla el proyecto **siga teniendo** una columna final: es lo que
    // separa este caso del respaldo heredado que fija el caso de abajo.
    await app.request(`/api/column/${columns.inReview.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isFinal: true }),
    });

    const task = await seedTask(project.id, "in-review", 1);
    expect(await readCompletedAt(task.id)).toBeInstanceOf(Date);

    const response = await app.request(`/api/column/${columns.inReview.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isFinal: false }),
    });

    expect(response.status).toBe(200);
    expect(await readCompletedAt(task.id)).toBeNull();
  });

  // El respaldo heredado, clavado porque sorprende: desmarcar la **unica**
  // columna final de un proyecto no deja las tareas de `done` sin fecha. La
  // regla dice que un proyecto sin ninguna columna final sigue entendiendo el
  // slug `done`, que es lo que Kaneo daba por terminado antes de que las
  // columnas fueran configurables, y no hay forma de distinguir "nunca se
  // configuro" de "se desconfiguro a proposito".
  it("keeps done meaning done when the project runs out of final columns", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const { project, columns } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });

    const task = await seedTask(project.id, "done", 1);
    expect(await readCompletedAt(task.id)).toBeInstanceOf(Date);

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request(`/api/column/${columns.done.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isFinal: false }),
    });

    expect(response.status).toBe(200);
    expect(await readCompletedAt(task.id)).toBeInstanceOf(Date);
  });

  it("leaves completed_at alone when is_final does not change", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const { project, columns } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });

    const task = await seedTask(project.id, "done", 1);
    const before = await readCompletedAt(task.id);
    expect(before).toBeInstanceOf(Date);

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    // Solo el nombre: el resellado no debe dispararse, ni pagar un UPDATE sobre
    // todas las tareas del proyecto, por renombrar una columna.
    const response = await app.request(`/api/column/${columns.done.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Cerradas" }),
    });

    expect(response.status).toBe(200);
    expect(await readCompletedAt(task.id)).toEqual(before);
  });

  it("does not touch the tasks of another project", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const mine = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const other = await createProjectFixture({
      workspaceId: member.workspace.id,
    });

    const untouched = await seedTask(other.project.id, "done", 1);
    const before = await readCompletedAt(untouched.id);

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    await app.request(`/api/column/${mine.columns.inReview.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isFinal: true }),
    });

    expect(await readCompletedAt(untouched.id)).toEqual(before);
  });
});
