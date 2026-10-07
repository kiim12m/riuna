import { and, eq } from "drizzle-orm";
import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  addWorkspaceMember,
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

type App = ReturnType<typeof createApp>["app"];
type Report = {
  rows: number;
  created: number;
  updated: number;
  failed: number;
  skipped: number;
  commentsAdded: number;
  commentsKept: number;
  projects: Array<{ name: string; projectId: string | null; pending: number }>;
};

const day = (y: number, m: number, d: number) =>
  new Date(Date.UTC(y, m - 1, d));

/** Un cuadro como el que se llevaba a mano: cabeceras, leyenda y filas. */
async function handMadeSheet(rows: Array<(string | Date | null)[]>) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Full1");
  sheet.addRow([null, "TAREAS"]);
  sheet.addRow([
    "Fecha",
    "FECHA",
    "CONCEPTO",
    "PROYECTO",
    "Estado",
    "Comentario",
  ]);
  sheet.addRow([
    day(2026, 1, 1),
    null,
    "Breve explicación. Ej: Croquis",
    "Empresa + ubicación",
    "Pendiente",
    "Respuesta",
  ]);
  for (const row of rows) sheet.addRow(row);
  sheet.addRow([null, null, null, null, "-"]);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function upload(
  app: App,
  path: string,
  buffer: Buffer,
  fields: Record<string, string> = {},
) {
  const form = new FormData();
  form.append("file", new File([buffer], "cuadro.xlsx"));
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  return app.request(path, { method: "POST", body: form });
}

async function json<T>(response: Response) {
  if (response.status !== 200) {
    throw new Error(`${response.status} ${await response.text()}`);
  }
  return (await response.json()) as T;
}

async function setup() {
  const owner = await createWorkspaceMember({ role: "owner" });
  const { project, columns } = await createProjectFixture({
    workspaceId: owner.workspace.id,
    name: "Obras",
  });
  mockAuthenticatedSession(owner.user);
  const app = createApp().app;
  const base = `/api/task/import/servitec/${owner.workspace.id}`;
  return { owner, project, columns, app, base };
}

const SHEET = [
  [
    day(2026, 5, 29),
    null,
    "Revisar tierra",
    "Obras",
    "En curso",
    "03/06/2026 — Pedir medidas\n05/06/2026 — Recibido",
  ],
  [day(2026, 6, 2), null, "Cerrar presupuesto", "Obras", ".Realizado", null],
  [
    day(2026, 8, 17),
    null,
    "Enviar fotos",
    "Bauhaus Torrevieja",
    "Pendiente",
    "Llamar antes",
  ],
];

const tasksOf = (projectId: string) =>
  db
    .select()
    .from(schema.taskTable)
    .where(eq(schema.taskTable.projectId, projectId))
    .orderBy(schema.taskTable.title);

const commentsOf = (taskId: string) =>
  db
    .select()
    .from(schema.activityTable)
    .where(
      and(
        eq(schema.activityTable.taskId, taskId),
        eq(schema.activityTable.type, "comment"),
      ),
    )
    .orderBy(schema.activityTable.createdAt);

describe("API integration: SERVITEC sheet import", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("migrates the hand-kept board, creating the project it is asked to", async () => {
    const { owner, project, columns, app, base } = await setup();
    const buffer = await handMadeSheet(SHEET);

    const analysis = await json<{
      rows: number;
      projects: Array<{ name: string; projectId: string | null; rows: number }>;
    }>(await upload(app, `${base}/analyze`, buffer));
    expect(analysis.rows).toBe(3);
    expect(analysis.projects).toEqual([
      { name: "Obras", projectId: project.id, rows: 2 },
      { name: "Bauhaus Torrevieja", projectId: null, rows: 1 },
    ]);

    const report = await json<Report>(
      await upload(app, base, buffer, {
        choices: JSON.stringify({ "Bauhaus Torrevieja": { action: "create" } }),
      }),
    );
    expect([report.created, report.updated, report.failed]).toEqual([3, 0, 0]);
    expect(report.commentsAdded).toBe(3);

    const [cerrar, revisar] = await tasksOf(project.id);
    expect([cerrar?.title, cerrar?.status]).toEqual([
      "Cerrar presupuesto",
      "archived",
    ]);
    expect([revisar?.title, revisar?.status]).toEqual([
      "Revisar tierra",
      columns.inProgress.slug,
    ]);
    // La fecha de alta es la de la hoja.
    expect(revisar?.createdAt.toISOString().slice(0, 10)).toBe("2026-05-29");

    const comments = await commentsOf(revisar?.id ?? "");
    expect(comments.map((c) => [c.content, c.externalSource])).toEqual([
      ["<p>Pedir medidas</p>", "servitec"],
      ["<p>Recibido</p>", "servitec"],
    ]);
    expect(comments[0]?.createdAt.toISOString().slice(0, 10)).toBe(
      "2026-06-03",
    );

    const [created] = await db
      .select()
      .from(schema.projectTable)
      .where(
        and(
          eq(schema.projectTable.workspaceId, owner.workspace.id),
          eq(schema.projectTable.name, "Bauhaus Torrevieja"),
        ),
      );
    expect((await tasksOf(created?.id ?? "")).map((t) => t.title)).toEqual([
      "Enviar fotos",
    ]);
  });

  it("uploading the same board again duplicates nothing", async () => {
    const { project, app, base } = await setup();
    const buffer = await handMadeSheet(SHEET.slice(0, 2));

    await json<Report>(await upload(app, base, buffer));
    const again = await json<Report>(await upload(app, base, buffer));

    expect([again.created, again.updated]).toEqual([0, 2]);
    expect([again.commentsAdded, again.commentsKept]).toEqual([0, 2]);
    expect(await tasksOf(project.id)).toHaveLength(2);
  });

  it("round trip: an exported sheet edited in Excel updates by its hidden ID", async () => {
    const { owner, project, columns, app, base } = await setup();
    await json<Report>(
      await upload(app, base, await handMadeSheet(SHEET.slice(0, 1))),
    );
    const [task] = await tasksOf(project.id);

    const exported = await app.request(
      `/api/task/export/servitec/${owner.workspace.id}`,
    );
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(await exported.arrayBuffer()));
    const sheet = workbook.getWorksheet("Full1");
    if (!sheet) throw new Error("No sheet");
    expect(sheet.getCell("J4").value).toBe(task?.id);

    // En Excel: otro concepto, terminada, y un comentario mas.
    sheet.getCell("C4").value = "Revisar toma de tierra";
    sheet.getCell("E4").value = "Realizado";
    sheet.getCell("F4").value =
      `${sheet.getCell("F4").text}\n07/06/2026 — Cerrado con el cliente`;
    const edited = Buffer.from(await workbook.xlsx.writeBuffer());

    const report = await json<Report>(await upload(app, base, edited));
    expect([report.created, report.updated]).toEqual([0, 1]);
    // Los dos comentarios que salieron de Riuna no se repiten.
    expect([report.commentsAdded, report.commentsKept]).toEqual([1, 2]);

    const [after] = await tasksOf(project.id);
    expect([after?.id, after?.title, after?.status]).toEqual([
      task?.id,
      "Revisar toma de tierra",
      columns.done.slug,
    ]);
  });

  it("asks about unknown projects, and can map or skip them", async () => {
    const { owner, project, app, base } = await setup();
    const buffer = await handMadeSheet(SHEET);

    const unresolved = await upload(app, base, buffer);
    expect(unresolved.status).toBe(400);
    expect(await unresolved.text()).toContain("Bauhaus Torrevieja");

    const skipped = await json<Report>(
      await upload(app, base, buffer, {
        choices: JSON.stringify({ "Bauhaus Torrevieja": { action: "skip" } }),
      }),
    );
    expect([skipped.created, skipped.skipped]).toEqual([2, 1]);

    const other = await createProjectFixture({
      workspaceId: owner.workspace.id,
      name: "Tiendas",
    });
    const mapped = await json<Report>(
      await upload(app, base, buffer, {
        choices: JSON.stringify({
          "Bauhaus Torrevieja": { action: "map", projectId: other.project.id },
        }),
      }),
    );
    expect(mapped.created).toBe(1);
    expect((await tasksOf(other.project.id)).map((t) => t.title)).toEqual([
      "Enviar fotos",
    ]);
    expect(await tasksOf(project.id)).toHaveLength(2);
  });

  it("a dry run writes nothing, and counts what a new project would get", async () => {
    const { owner, project, app, base } = await setup();
    const report = await json<Report>(
      await upload(app, base, await handMadeSheet(SHEET), {
        choices: JSON.stringify({ "Bauhaus Torrevieja": { action: "create" } }),
        dryRun: "true",
      }),
    );

    expect(report.created).toBe(2);
    expect(report.projects.find((p) => p.projectId === null)?.pending).toBe(1);
    expect(await tasksOf(project.id)).toEqual([]);
    const projects = await db
      .select()
      .from(schema.projectTable)
      .where(eq(schema.projectTable.workspaceId, owner.workspace.id));
    expect(projects).toHaveLength(1);
  });

  // Importar pide `task:create`, y crear un proyecto, `project:create`: un
  // miembro tiene los dos, como desde la pagina de proyectos; un lector, ninguno.
  it("a viewer cannot import; a member can, creating the project too", async () => {
    const { owner, app, base } = await setup();
    const buffer = await handMadeSheet(SHEET);
    const choices = JSON.stringify({
      "Bauhaus Torrevieja": { action: "create" },
    });

    mockAuthenticatedSession(
      await addWorkspaceMember(owner.workspace.id, "viewer"),
    );
    expect((await upload(app, base, buffer, { choices })).status).toBe(403);

    mockAuthenticatedSession(
      await addWorkspaceMember(owner.workspace.id, "member"),
    );
    const report = await json<Report>(
      await upload(app, base, buffer, { choices }),
    );
    expect(report.created).toBe(3);
  });
});
