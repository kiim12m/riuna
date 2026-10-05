import { eq } from "drizzle-orm";
import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAnonymousSession, mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
  taskTreeValues,
} from "./helpers/fixtures";

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

async function createTask({
  projectId,
  columnId,
  title,
  status,
  number,
}: {
  projectId: string;
  columnId?: string;
  title: string;
  status: string;
  number: number;
}) {
  const [task] = await db
    .insert(schema.taskTable)
    .values({
      ...taskTreeValues(),
      projectId,
      title,
      status,
      columnId,
      priority: "medium",
      number,
      position: number,
    })
    .returning();

  if (!task) throw new Error("Failed to seed task");
  return task;
}

async function readSheet(response: Response) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await response.arrayBuffer());
  const sheet = workbook.getWorksheet("Full1");
  if (!sheet) throw new Error("The response does not carry a Full1 sheet");
  return sheet;
}

// Reads the CONCEPTO/PROYECTO/Estado triples out of the data rows.
function dataRows(sheet: ExcelJS.Worksheet) {
  const rows: Array<[unknown, unknown, unknown]> = [];
  for (let row = 4; row <= sheet.rowCount; row += 1) {
    const concepto = sheet.getCell(row, 3).value;
    if (!concepto) continue;
    rows.push([
      concepto,
      sheet.getCell(row, 4).value,
      sheet.getCell(row, 5).value,
    ]);
  }
  return rows;
}

describe("API integration: workspace tasks spreadsheet export", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("refuses an anonymous request", async () => {
    const member = await createWorkspaceMember({ role: "member" });

    mockAnonymousSession();
    const { app } = createApp();

    const response = await app.request(
      `/api/task/export/servitec/${member.workspace.id}`,
    );

    expect(response.status).toBe(401);
  });

  it("refuses a member of another workspace", async () => {
    const owner = await createWorkspaceMember({ role: "owner" });
    const outsider = await createWorkspaceMember({ role: "owner" });

    mockAuthenticatedSession(outsider.user);
    const { app } = createApp();

    const response = await app.request(
      `/api/task/export/servitec/${owner.workspace.id}`,
    );

    expect(response.status).toBe(403);
  });

  it("lets a viewer download it, since reading tasks is all it needs", async () => {
    const viewer = await createWorkspaceMember({ role: "viewer" });
    const { project, columns } = await createProjectFixture({
      workspaceId: viewer.workspace.id,
    });
    await createTask({
      projectId: project.id,
      columnId: columns.todo.id,
      title: "Revisar acometidas",
      status: "to-do",
      number: 1,
    });

    mockAuthenticatedSession(viewer.user);
    const { app } = createApp();

    const response = await app.request(
      `/api/task/export/servitec/${viewer.workspace.id}`,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(XLSX_MIME);
    expect(response.headers.get("Content-Disposition")).toContain("attachment");
    expect(response.headers.get("Content-Disposition")).toContain(
      `tareas-${viewer.workspace.slug}-`,
    );
  });

  it("puts every project of the workspace in one flat sheet", async () => {
    const owner = await createWorkspaceMember({ role: "owner" });
    const torrevieja = await createProjectFixture({
      workspaceId: owner.workspace.id,
      name: "BAUHAUS TORREVIEJA",
    });
    const santBoi = await createProjectFixture({
      workspaceId: owner.workspace.id,
      name: "IES SANT BOI",
    });

    await createTask({
      projectId: torrevieja.project.id,
      columnId: torrevieja.columns.todo.id,
      title: "Revisar Puesta a Tierra",
      status: "to-do",
      number: 1,
    });
    await createTask({
      projectId: santBoi.project.id,
      columnId: santBoi.columns.inProgress.id,
      title: "Enviar fotografies CGP",
      status: "in-progress",
      number: 1,
    });

    mockAuthenticatedSession(owner.user);
    const { app } = createApp();

    const response = await app.request(
      `/api/task/export/servitec/${owner.workspace.id}`,
    );
    const sheet = await readSheet(response);

    expect(dataRows(sheet)).toEqual([
      ["Revisar Puesta a Tierra", "BAUHAUS TORREVIEJA", "Pendiente"],
      ["Enviar fotografies CGP", "IES SANT BOI", "En curso"],
    ]);
  });

  it("maps each column to the status the board uses", async () => {
    const owner = await createWorkspaceMember({ role: "owner" });
    const { project, columns } = await createProjectFixture({
      workspaceId: owner.workspace.id,
      name: "ONDINA VILAMALLA",
    });

    await createTask({
      projectId: project.id,
      columnId: columns.todo.id,
      title: "Pendiente",
      status: "to-do",
      number: 1,
    });
    await createTask({
      projectId: project.id,
      columnId: columns.inReview.id,
      title: "En revision",
      status: "in-review",
      number: 2,
    });
    await createTask({
      projectId: project.id,
      columnId: columns.done.id,
      title: "Terminada",
      status: "done",
      number: 3,
    });
    // Archived and backlog tasks carry a sentinel status instead of a column.
    await createTask({
      projectId: project.id,
      title: "Archivada",
      status: "archived",
      number: 4,
    });
    await createTask({
      projectId: project.id,
      title: "En el backlog",
      status: "planned",
      number: 5,
    });

    mockAuthenticatedSession(owner.user);
    const { app } = createApp();

    const response = await app.request(
      `/api/task/export/servitec/${owner.workspace.id}`,
    );
    const sheet = await readSheet(response);

    expect(
      dataRows(sheet).map(([concepto, , estado]) => [concepto, estado]),
    ).toEqual([
      ["Pendiente", "Pendiente"],
      ["En revision", "En curso"],
      ["Terminada", "Realizado"],
      ["Archivada", ".Realizado"],
      ["En el backlog", "Pendiente"],
    ]);
  });

  it("leaves out the tasks of an archived project", async () => {
    const owner = await createWorkspaceMember({ role: "owner" });
    const live = await createProjectFixture({
      workspaceId: owner.workspace.id,
      name: "ONDINA PINTO",
    });
    const shelved = await createProjectFixture({
      workspaceId: owner.workspace.id,
      name: "GOU MENORCA",
    });

    await db
      .update(schema.projectTable)
      .set({ archivedAt: new Date() })
      .where(eq(schema.projectTable.id, shelved.project.id));

    await createTask({
      projectId: live.project.id,
      columnId: live.columns.todo.id,
      title: "Sigue viva",
      status: "to-do",
      number: 1,
    });
    await createTask({
      projectId: shelved.project.id,
      columnId: shelved.columns.todo.id,
      title: "Proyecto guardado",
      status: "to-do",
      number: 1,
    });

    mockAuthenticatedSession(owner.user);
    const { app } = createApp();

    const response = await app.request(
      `/api/task/export/servitec/${owner.workspace.id}`,
    );
    const sheet = await readSheet(response);

    expect(dataRows(sheet).map(([concepto]) => concepto)).toEqual([
      "Sigue viva",
    ]);
  });

  it("stacks the comments of a task, oldest first, each with its date", async () => {
    const owner = await createWorkspaceMember({ role: "owner" });
    const { project, columns } = await createProjectFixture({
      workspaceId: owner.workspace.id,
    });
    const task = await createTask({
      projectId: project.id,
      columnId: columns.done.id,
      title: "Revisar certificacio",
      status: "done",
      number: 1,
    });

    // Los comentarios son filas de `activity` con `type = 'comment'`, que es lo
    // que `createComment` escribe. La tabla `comment` heredada no la toca nadie.
    await db.insert(schema.activityTable).values([
      {
        taskId: task.id,
        type: "comment",
        userId: owner.user.id,
        // Dos parrafos con uno vacio entre medias, como los deja el editor.
        content:
          "<p>Revisada i <strong>enviada</strong> per corregir</p><p></p><p>Falta el plànol</p>",
        createdAt: new Date("2026-08-05T09:00:00Z"),
      },
      // Un evento del sistema entre medias: no es un comentario y no debe salir
      // en la columna.
      {
        taskId: task.id,
        type: "task.status_changed",
        userId: owner.user.id,
        content: null,
        eventData: { oldStatus: "in-progress", newStatus: "done" },
        createdAt: new Date("2026-08-05T12:00:00Z"),
      },
      {
        taskId: task.id,
        type: "comment",
        userId: owner.user.id,
        content: "Ok, pero falten pressupostos",
        createdAt: new Date("2026-08-06T09:00:00Z"),
      },
    ]);

    mockAuthenticatedSession(owner.user);
    const { app } = createApp();

    const response = await app.request(
      `/api/task/export/servitec/${owner.workspace.id}`,
    );
    const sheet = await readSheet(response);

    // Seguidos, sin lineas en blanco, y la fecha en negrita.
    expect(sheet.getCell("F4").text).toBe(
      "05/08/2026 — Revisada i enviada per corregir\nFalta el plànol\n06/08/2026 — Ok, pero falten pressupostos",
    );
    const value = sheet.getCell("F4").value as ExcelJS.CellRichTextValue;
    expect(
      value.richText.filter((run) => run.font?.bold).map((run) => run.text),
    ).toEqual(["05/08/2026", "06/08/2026"]);
  });

  it("returns an empty but usable sheet for a workspace with no tasks", async () => {
    const owner = await createWorkspaceMember({ role: "owner" });

    mockAuthenticatedSession(owner.user);
    const { app } = createApp();

    const response = await app.request(
      `/api/task/export/servitec/${owner.workspace.id}`,
    );
    const sheet = await readSheet(response);

    expect(response.status).toBe(200);
    expect(sheet.getCell("A2").value).toBe("Fecha");
    expect(dataRows(sheet)).toEqual([]);
  });
});
