import { asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

/**
 * La importacion es la puerta por la que la Fase 5 va a meter miles de filas.
 * Hasta la Fase 4.5 hacia ~4 viajes a la base **por fila**, en serie y sin
 * transaccion envolvente: 5.000 filas no cabian en una peticion HTTP, y un
 * corte a medias dejaba media importacion hecha sin forma de deshacerla.
 */

async function importTasks(
  app: ReturnType<typeof createApp>["app"],
  projectId: string,
  tasks: Array<Record<string, unknown>>,
) {
  return app.request(`/api/task/import/${projectId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tasks }),
  });
}

describe("API integration: importing tasks", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("imports a large batch in one transaction with contiguous numbers", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const tasks = Array.from({ length: 600 }, (_, index) => ({
      title: `Fila ${index + 1}`,
      status: "to-do",
      priority: "medium",
    }));

    const response = await importTasks(app, project.id, tasks);
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      results: { total: number; successful: number; failed: number };
    };

    expect(body.results.total).toBe(600);
    expect(body.results.successful).toBe(600);
    expect(body.results.failed).toBe(0);

    const rows = await db
      .select({ number: schema.taskTable.number })
      .from(schema.taskTable)
      .where(eq(schema.taskTable.projectId, project.id))
      .orderBy(asc(schema.taskTable.number));

    expect(rows).toHaveLength(600);
    // Numeros correlativos: `claimTaskNumbers` reserva el rango entero de una
    // vez, en vez de reclamarlos de uno en uno.
    expect(rows.map((row) => row.number)).toEqual(
      Array.from({ length: 600 }, (_, index) => index + 1),
    );

    // Y el contador del proyecto queda donde debe, no 600 versiones despues.
    const [updated] = await db
      .select({ lastTaskNumber: schema.projectTable.lastTaskNumber })
      .from(schema.projectTable)
      .where(eq(schema.projectTable.id, project.id));

    expect(updated.lastTaskNumber).toBe(600);
  });

  it("still reports per-row failures without dropping the good rows", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const outsider = await createWorkspaceMember({ role: "admin" });
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await importTasks(app, project.id, [
      { title: "Buena", status: "to-do" },
      // Asignada a alguien de otro espacio: esta fila falla, las otras no.
      { title: "Mala", status: "to-do", userId: outsider.user.id },
      { title: "Otra buena", status: "to-do" },
    ]);

    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      results: {
        successful: number;
        failed: number;
        tasks: Array<{ success: boolean; error?: string }>;
      };
    };

    expect(body.results.successful).toBe(2);
    expect(body.results.failed).toBe(1);
    expect(body.results.tasks.find((row) => !row.success)?.error).toContain(
      "not a member",
    );

    const titles = await db
      .select({ title: schema.taskTable.title })
      .from(schema.taskTable)
      .where(eq(schema.taskTable.projectId, project.id));

    expect(titles.map((row) => row.title).sort()).toEqual([
      "Buena",
      "Otra buena",
    ]);
  });

  it("parks an unknown status in `planned` and warns about it", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await importTasks(app, project.id, [
      { title: "Estado raro", status: "no-existe" },
    ]);

    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      results: { tasks: Array<{ success: boolean; warnings?: string[] }> };
    };

    // El aviso llega hasta la respuesta, que es lo unico que quien importa
    // tiene para enterarse de que su fichero traia un estado que no existe.
    expect(body.results.tasks[0].warnings?.join(" ")).toContain("no-existe");

    const [imported] = await db
      .select({
        status: schema.taskTable.status,
        columnId: schema.taskTable.columnId,
      })
      .from(schema.taskTable)
      .where(eq(schema.taskTable.projectId, project.id));

    // `planned` es un pseudo-estado al margen del flujo, como `archived`: no
    // tiene columna, y la tarea sale en `plannedTasks`.
    expect(imported.status).toBe("planned");
    expect(imported.columnId).toBeNull();
  });
});
