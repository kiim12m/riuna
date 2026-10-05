import { eq, inArray, sql } from "drizzle-orm";
import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { proposeMapping } from "../../apps/api/src/task/exchange/map-rows";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

/**
 * El formato de intercambio de la Fase 5 (ADR 017). Lo que estas pruebas
 * vigilan no es que la importacion funcione, sino las tres promesas que el
 * formato hace y que son faciles de romper sin darse cuenta:
 *
 *  - Reimportar el mismo fichero **no duplica nada**.
 *  - El esquema `1.2.3` reconstruye la jerarquia, y **nunca mueve en silencio**
 *    una tarea cuyo padre no venga en el fichero.
 *  - Lo que el fichero no mapea no se toca.
 */

type App = ReturnType<typeof createApp>["app"];

function asUser(user: typeof schema.userTable.$inferSelect): App {
  mockAuthenticatedSession(user);
  return createApp().app;
}

async function setup(role = "admin") {
  const member = await createWorkspaceMember({ role });
  const fixture = await createProjectFixture({
    workspaceId: member.workspace.id,
  });

  return {
    app: asUser(member.user),
    user: member.user,
    workspaceId: member.workspace.id,
    projectId: fixture.project.id,
  };
}

/** Un CSV a partir de la cabecera y las filas, con el BOM que Excel espera. */
function csv(headers: string[], rows: string[][]): string {
  const quote = (value: string) =>
    /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;

  return `﻿${[headers, ...rows]
    .map((row) => row.map(quote).join(","))
    .join("\r\n")}\r\n`;
}

async function post(
  app: App,
  path: string,
  content: string,
  extra: Record<string, string> = {},
  filename = "tareas.csv",
) {
  const headers = content.replace(/^﻿/, "").split("\r\n")[0]?.split(",") ?? [];
  const form = new FormData();
  form.append("file", new File([content], filename, { type: "text/csv" }));

  if (!("mapping" in extra)) {
    form.append("mapping", JSON.stringify(proposeMapping(headers)));
  }
  for (const [key, value] of Object.entries(extra)) {
    form.append(key, value);
  }

  const response = await app.request(path, { method: "POST", body: form });

  // Sin esto, un 400 se ve como "results is undefined" diez veces seguidas y
  // no se sabe por que.
  if (response.status !== 200) {
    throw new Error(`${response.status}: ${await response.text()}`);
  }

  return response;
}

function importFile(
  app: App,
  projectId: string,
  content: string,
  extra?: Record<string, string>,
) {
  return post(app, `/api/task/import/${projectId}`, content, extra);
}

type Report = {
  results: {
    total: number;
    created: number;
    updated: number;
    failed: number;
    rows: Array<Record<string, unknown>>;
  };
  fieldsCreated: string[];
  outline: Array<Record<string, unknown>>;
  siblingGroupsKept: number;
};

async function tasksOf(projectId: string) {
  return db
    .select()
    .from(schema.taskTable)
    .where(eq(schema.taskTable.projectId, projectId));
}

describe("API integration: the exchange format", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("rebuilds the hierarchy from the outline numbering", async () => {
    const { app, projectId } = await setup();

    const response = await importFile(
      app,
      projectId,
      csv(
        ["Esquema", "Título", "Estado"],
        [
          ["1", "Instalación Norte", "To Do"],
          ["1.1", "Cableado", "To Do"],
          ["1.1.1", "Tirar tubo", "Done"],
          ["1.2", "Cuadro", "To Do"],
          ["2", "Mantenimiento", "To Do"],
        ],
      ),
    );

    expect(response.status).toBe(200);
    const report = (await response.json()) as Report;
    expect(report.results.created).toBe(5);
    expect(report.results.failed).toBe(0);

    const tasks = await tasksOf(projectId);
    const byTitle = new Map(tasks.map((task) => [task.title, task]));

    const root = byTitle.get("Instalación Norte");
    const cableado = byTitle.get("Cableado");
    const tubo = byTitle.get("Tirar tubo");

    expect(cableado?.parentId).toBe(root?.id);
    expect(tubo?.parentId).toBe(cableado?.id);
    expect(tubo?.depth).toBe(2);
    expect(tubo?.path).toBe(`/${root?.id}/${cableado?.id}/${tubo?.id}/`);
    expect(byTitle.get("Mantenimiento")?.parentId).toBeNull();
  });

  it("does not duplicate anything when the same file is imported twice", async () => {
    const { app, projectId } = await setup();

    const first = csv(
      ["Referencia", "Esquema", "Título", "Estado"],
      [
        ["A-1", "1", "Instalación Norte", "To Do"],
        ["A-2", "1.1", "Cableado", "To Do"],
      ],
    );

    const created = (await (
      await importFile(app, projectId, first)
    ).json()) as Report;
    expect(created.results.created).toBe(2);

    const second = csv(
      ["Referencia", "Esquema", "Título", "Estado"],
      [
        ["A-1", "1", "Instalación Norte", "In Progress"],
        ["A-2", "1.1", "Cableado revisado", "To Do"],
      ],
    );

    const again = (await (
      await importFile(app, projectId, second)
    ).json()) as Report;

    expect(again.results.created).toBe(0);
    expect(again.results.updated).toBe(2);

    const tasks = await tasksOf(projectId);
    expect(tasks).toHaveLength(2);
    expect(tasks.map((task) => task.title).sort()).toEqual([
      "Cableado revisado",
      "Instalación Norte",
    ]);
    expect(
      tasks.find((task) => task.title === "Instalación Norte")?.status,
    ).toBe("in-progress");
  });

  it("keeps the same external reference pointing at the same task", async () => {
    const { app, projectId, workspaceId } = await setup();

    await importFile(
      app,
      projectId,
      csv(["Referencia", "Título"], [["A-1", "Una"]]),
    );

    const refs = await db
      .select()
      .from(schema.externalRefTable)
      .where(eq(schema.externalRefTable.workspaceId, workspaceId));

    expect(refs).toHaveLength(1);
    expect(refs[0]?.externalId).toBe("A-1");
    expect(refs[0]?.entityType).toBe("task");
    expect(refs[0]?.source).toBe("csv:tareas");
  });

  it("round-trips the labels the old importer dropped in silence", async () => {
    const { app, projectId } = await setup();

    await importFile(
      app,
      projectId,
      csv(["Título", "Etiquetas"], [["Una", "obra; urgente"]]),
    );

    const tasks = await tasksOf(projectId);
    const labels = await db
      .select()
      .from(schema.labelTable)
      .where(eq(schema.labelTable.taskId, tasks[0]?.id ?? ""));

    expect(labels.map((label) => label.name).sort()).toEqual([
      "obra",
      "urgente",
    ]);
  });

  it("creates an epic by name once and reuses it afterwards", async () => {
    const { app, projectId } = await setup();

    const file = csv(
      ["Referencia", "Título", "Épicas"],
      [
        ["A-1", "Una", "Obra civil"],
        ["A-2", "Otra", "Obra civil"],
      ],
    );

    await importFile(app, projectId, file);
    await importFile(app, projectId, file);

    const epics = await db
      .select()
      .from(schema.epicTable)
      .where(eq(schema.epicTable.projectId, projectId));

    expect(epics).toHaveLength(1);
    expect(epics[0]?.name).toBe("Obra civil");

    const links = await db.select().from(schema.taskEpicTable);
    expect(links).toHaveLength(2);
  });

  it("never detaches a task whose parent is missing from a filtered file", async () => {
    const { app, projectId } = await setup();

    await importFile(
      app,
      projectId,
      csv(
        ["Referencia", "Esquema", "Título"],
        [
          ["A-1", "1", "Madre"],
          ["A-2", "1.1", "Hija"],
        ],
      ),
    );

    const before = await tasksOf(projectId);
    const hija = before.find((task) => task.title === "Hija");
    expect(hija?.parentId).not.toBeNull();

    // Una vista filtrada exporta la hija con el esquema de su camino completo
    // y sin la madre. Reimportarla no puede promoverla a raiz.
    const partial = csv(
      ["Referencia", "Esquema", "Título"],
      [["A-2", "1.1", "Hija renombrada"]],
    );

    const report = (await (
      await importFile(app, projectId, partial)
    ).json()) as Report;

    expect(report.results.updated).toBe(1);
    expect(report.outline).toContainEqual(
      expect.objectContaining({ kind: "orphan", outline: "1.1" }),
    );

    const after = await tasksOf(projectId);
    const stillHija = after.find((task) => task.id === hija?.id);
    expect(stillHija?.title).toBe("Hija renombrada");
    expect(stillHija?.parentId).toBe(hija?.parentId);
  });

  it("updates dates, estimate and custom fields on a second import", async () => {
    const { app, projectId, workspaceId } = await setup();

    await db.insert(schema.fieldDefinitionTable).values({
      workspaceId,
      projectId,
      key: "presupuesto",
      name: "Presupuesto",
      type: "number",
      config: {},
    });

    const header = [
      "Referencia",
      "Título",
      "Fecha inicio",
      "Fecha límite",
      "Estimación (h)",
      "Presupuesto",
    ];

    await importFile(
      app,
      projectId,
      csv(header, [
        ["A-1", "Una", "2026-09-01", "2026-09-10", "8", "1200"],
        ["A-2", "Otra", "", "", "", ""],
      ]),
    );

    const report = (await (
      await importFile(
        app,
        projectId,
        csv(header, [
          ["A-1", "Una", "2026-10-05", "2026-10-20", "2,5", "1500"],
          ["A-2", "Otra", "2026-11-01", "", "", ""],
        ]),
      )
    ).json()) as Report;

    expect(report.results.updated).toBe(2);

    const tasks = await tasksOf(projectId);
    const una = tasks.find((task) => task.title === "Una");
    const otra = tasks.find((task) => task.title === "Otra");

    // La actualizacion por lotes va con `unnest` de arrays tipados: si el cast
    // de `timestamp[]` o `integer[]` estuviera mal, esto reventaria o dejaria
    // el valor anterior.
    expect(una?.startDate?.toISOString().slice(0, 10)).toBe("2026-10-05");
    expect(una?.dueDate?.toISOString().slice(0, 10)).toBe("2026-10-20");
    expect(una?.estimate).toBe(9000);
    expect(una?.customFields).toEqual({ presupuesto: 1500 });

    // Y una celda vacia en una columna mapeada limpia el valor, sin arrastrar
    // el de la fila de al lado.
    expect(otra?.startDate?.toISOString().slice(0, 10)).toBe("2026-11-01");
    expect(otra?.dueDate).toBeNull();
    expect(otra?.estimate).toBeNull();
  });

  it("refuses to let two rows claim the same task", async () => {
    const { app, projectId } = await setup();

    await importFile(
      app,
      projectId,
      csv(["Referencia", "Título"], [["A-1", "Una"]]),
    );

    const [task] = await tasksOf(projectId);

    // El `UPDATE ... FROM unnest` no protesta ante una clave repetida: se
    // queda con una de las dos filas en silencio. Se corta antes.
    const report = (await (
      await importFile(
        app,
        projectId,
        csv(
          ["ID", "Título"],
          [
            [task?.id ?? "", "Primera"],
            [task?.id ?? "", "Segunda"],
          ],
        ),
      )
    ).json()) as Report;

    expect(report.results.updated).toBe(1);
    expect(report.results.failed).toBe(1);

    const after = await tasksOf(projectId);
    expect(after).toHaveLength(1);
    expect(after[0]?.title).toBe("Primera");
  });

  it("does not wipe assignees and epics when the file only maps labels", async () => {
    const { app, projectId, user, workspaceId } = await setup();

    await importFile(
      app,
      projectId,
      csv(
        ["Referencia", "Título", "Responsable", "Épicas", "Etiquetas"],
        [["A-1", "Una", user.email, "Obra civil", "obra"]],
      ),
    );

    const [task] = await tasksOf(projectId);
    expect(task?.userId).toBe(user.id);
    expect(await db.select().from(schema.taskAssigneeTable)).toHaveLength(1);
    expect(await db.select().from(schema.taskEpicTable)).toHaveLength(1);

    // Un fichero que solo trae etiquetas no puede vaciar lo demas. Antes si:
    // las tres reconciliaciones compartian la lista de tareas, asi que las de
    // asignados y epicas corrian con su lista de enlaces vacia.
    await importFile(
      app,
      projectId,
      csv(["Referencia", "Etiquetas"], [["A-1", "obra; urgente"]]),
    );

    expect(await db.select().from(schema.taskAssigneeTable)).toHaveLength(1);
    expect(await db.select().from(schema.taskEpicTable)).toHaveLength(1);

    const labels = await db
      .select()
      .from(schema.labelTable)
      .where(eq(schema.labelTable.taskId, task?.id ?? ""));
    expect(labels.map((label) => label.name).sort()).toEqual([
      "obra",
      "urgente",
    ]);
    expect(workspaceId).toBeTruthy();
  });

  it("keeps the primary assignee inside the assignee set", async () => {
    const { app, projectId, user } = await setup();

    await importFile(
      app,
      projectId,
      csv(
        ["Referencia", "Título", "Responsable"],
        [["A-1", "Una", user.email]],
      ),
    );

    const [task] = await tasksOf(projectId);
    expect(task?.userId).toBe(user.id);

    // `Asignados` mapeado y `Responsable` no: el responsable sigue siendo el
    // mismo, asi que tiene que seguir dentro de `task_assignee`. Es la
    // invariante de la ADR 010.
    await importFile(
      app,
      projectId,
      csv(["Referencia", "Asignados"], [["A-1", ""]]),
    );

    const after = await tasksOf(projectId);
    const assignees = await db.select().from(schema.taskAssigneeTable);

    expect(after[0]?.userId).toBe(user.id);
    expect(assignees.map((row) => row.userId)).toEqual([user.id]);
  });

  it("writes nothing on a dry run", async () => {
    const { app, projectId } = await setup();

    const response = await importFile(
      app,
      projectId,
      csv(["Título"], [["Una"], ["Otra"]]),
      { dryRun: "true" },
    );

    const report = (await response.json()) as Report & { dryRun: boolean };

    expect(report.dryRun).toBe(true);
    expect(report.results.created).toBe(2);
    expect(await tasksOf(projectId)).toHaveLength(0);
  });

  it("reports a row without a title instead of dropping the good ones", async () => {
    const { app, projectId } = await setup();

    const response = await importFile(
      app,
      projectId,
      csv(
        ["Título", "Estado"],
        [
          ["Una", "To Do"],
          ["", "To Do"],
          ["Otra", "To Do"],
        ],
      ),
    );

    const report = (await response.json()) as Report;

    expect(report.results.created).toBe(2);
    expect(report.results.failed).toBe(1);
    expect(await tasksOf(projectId)).toHaveLength(2);
  });

  it("parks an unknown status in planned and warns", async () => {
    const { app, projectId } = await setup();

    const response = await importFile(
      app,
      projectId,
      csv(["Título", "Estado"], [["Una", "Inventado"]]),
    );

    const report = (await response.json()) as Report;
    const tasks = await tasksOf(projectId);

    expect(tasks[0]?.status).toBe("planned");
    expect(report.results.rows[0]).toMatchObject({ outcome: "created" });
  });

  it("imports a large batch in one transaction with contiguous numbers", async () => {
    const { app, projectId } = await setup();

    const rows = Array.from({ length: 600 }, (_, index) => [
      `Fila ${index + 1}`,
      "To Do",
    ]);

    const response = await importFile(
      app,
      projectId,
      csv(["Título", "Estado"], rows),
    );

    const report = (await response.json()) as Report;
    expect(report.results.created).toBe(600);

    const tasks = await tasksOf(projectId);
    const numbers = tasks.map((task) => task.number ?? 0).sort((a, b) => a - b);

    expect(numbers).toHaveLength(600);
    expect(numbers[0]).toBe(1);
    expect(numbers[599]).toBe(600);

    // Los eventos salen por tandas despues de responder: ninguna tarea se queda
    // sin su actividad aunque la base este ocupada (antes los gestores se
    // quedaban sin conexion y la perdian en silencio).
    await vi.waitFor(
      async () => {
        const [row] = await db
          .select({ total: sql<number>`count(*)` })
          .from(schema.activityTable)
          .where(
            inArray(
              schema.activityTable.taskId,
              tasks.map((task) => task.id),
            ),
          );
        expect(Number(row?.total)).toBe(600);
      },
      { timeout: 60_000, interval: 250 },
    );
  });

  it("reorders siblings to match the file when it lists the whole group", async () => {
    const { app, projectId } = await setup();

    const header = ["Referencia", "Esquema", "Título"];
    await importFile(
      app,
      projectId,
      csv(header, [
        ["R", "1", "Raíz"],
        ["A", "1.1", "Primera"],
        ["B", "1.2", "Segunda"],
        ["C", "1.3", "Tercera"],
      ]),
    );

    // Las mismas tres hijas (casadas por Referencia), en otro orden y con el
    // grupo entero en el fichero.
    const report = (await (
      await importFile(
        app,
        projectId,
        csv(header, [
          ["R", "1", "Raíz"],
          ["C", "1.1", "Tercera"],
          ["A", "1.2", "Primera"],
          ["B", "1.3", "Segunda"],
        ]),
      )
    ).json()) as Report;

    expect(report.results.updated).toBe(4);
    expect(report.siblingGroupsKept).toBe(0);

    const tasks = await tasksOf(projectId);
    const positionOf = (title: string) =>
      tasks.find((task) => task.title === title)?.position ?? -1;

    expect(positionOf("Tercera")).toBeLessThan(positionOf("Primera"));
    expect(positionOf("Primera")).toBeLessThan(positionOf("Segunda"));
  });

  it("keeps the sibling order when the file does not list every subtask", async () => {
    const { app, projectId } = await setup();

    const header = ["Referencia", "Esquema", "Título"];
    await importFile(
      app,
      projectId,
      csv(header, [
        ["R", "1", "Raíz"],
        ["A", "1.1", "Primera"],
        ["B", "1.2", "Segunda"],
        ["C", "1.3", "Tercera"],
      ]),
    );

    const before = await tasksOf(projectId);
    const positionBefore = new Map(
      before.map((task) => [task.title, task.position]),
    );

    // Falta "Segunda": el grupo de hijas de la raíz está incompleto y no se
    // toca, aunque el fichero las liste en otro orden.
    const report = (await (
      await importFile(
        app,
        projectId,
        csv(header, [
          ["R", "1", "Raíz"],
          ["C", "1.1", "Tercera"],
          ["A", "1.2", "Primera"],
        ]),
      )
    ).json()) as Report;

    expect(report.siblingGroupsKept).toBeGreaterThanOrEqual(1);

    const after = await tasksOf(projectId);
    const positionAfter = new Map(
      after.map((task) => [task.title, task.position]),
    );

    for (const title of ["Primera", "Segunda", "Tercera"]) {
      expect(positionAfter.get(title)).toBe(positionBefore.get(title));
    }
  });
});

describe("API integration: exporting the exchange format", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("round-trips a tree through a spreadsheet without losing anything", async () => {
    const { app, projectId } = await setup();

    await importFile(
      app,
      projectId,
      csv(
        [
          "Esquema",
          "Título",
          "Estado",
          "Etiquetas",
          "Épicas",
          "Estimación (h)",
        ],
        [
          ["1", "Instalación Norte", "To Do", "obra", "Obra civil", "10"],
          [
            "1.1",
            "Cableado",
            "In Progress",
            "obra; urgente",
            "Obra civil",
            "4",
          ],
          ["1.1.1", "Tirar tubo", "Done", "", "", "1,5"],
          ["2", "Mantenimiento", "To Do", "", "", ""],
        ],
      ),
    );

    const response = await app.request(
      `/api/task/export/${projectId}?format=xlsx`,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("spreadsheetml");

    // El cuerpo solo se puede leer una vez: se guarda y se reutiliza.
    const exported = await response.arrayBuffer();

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(exported);
    const sheet = workbook.getWorksheet("Tareas");
    expect(sheet).toBeDefined();

    if (!sheet) throw new Error("the exported workbook has no Tareas sheet");

    const header = (sheet.getRow(1).values as unknown[]).slice(1) as string[];
    const outlineAt = header.indexOf("Esquema");
    const titleAt = header.indexOf("Título");
    const labelsAt = header.indexOf("Etiquetas");
    const estimateAt = header.indexOf("Estimación (h)");

    const rows: string[][] = [];
    sheet.eachRow({ includeEmpty: false }, (row, index) => {
      if (index === 1) return;
      rows.push(
        header.map((_, column) => String(row.getCell(column + 1).value ?? "")),
      );
    });

    expect(rows).toHaveLength(4);

    // Recorrido en preorden, con la jerarquia expresada en el esquema.
    expect(rows.map((row) => row[outlineAt])).toEqual([
      "1",
      "1.1",
      "1.1.1",
      "2",
    ]);
    expect(rows.map((row) => row[titleAt])).toEqual([
      "Instalación Norte",
      "Cableado",
      "Tirar tubo",
      "Mantenimiento",
    ]);

    // Las etiquetas son la fuga que el formato heredado tenia: el export las
    // emitia y el validador del import las descartaba.
    expect(rows[1]?.[labelsAt]).toBe("obra; urgente");
    expect(rows[2]?.[estimateAt]).toBe("1.5");

    // Y el fichero exportado vuelve a entrar sin duplicar nada, porque lleva
    // la columna `ID`.
    const reimported = (await (
      await post(
        app,
        `/api/task/import/${projectId}`,
        await sheetToCsv(exported),
      )
    ).json()) as Report;

    expect(reimported.results.created).toBe(0);
    expect(reimported.results.updated).toBe(4);
    expect(await tasksOf(projectId)).toHaveLength(4);
  });

  it("exports only what the filter matches, with the outline of the full path", async () => {
    const { app, projectId } = await setup();

    await importFile(
      app,
      projectId,
      csv(
        ["Esquema", "Título", "Estado"],
        [
          ["1", "Madre", "To Do"],
          ["1.1", "Hija", "Done"],
        ],
      ),
    );

    const filter = encodeURIComponent(
      JSON.stringify({
        type: "condition",
        field: "status",
        operator: "eq",
        value: "done",
      }),
    );

    const response = await app.request(
      `/api/task/export/${projectId}?format=csv&filter=${filter}`,
    );

    expect(response.status).toBe(200);
    const text = await response.text();
    const lines = text.replace(/^﻿/, "").trim().split("\r\n");

    // Solo la hija, pero con `1.1`: su madre ocupa su nivel aunque no salga.
    // Es la regla 4, y es lo que hace que reimportar no la promueva a raiz.
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("1.1");
    expect(lines[1]).toContain("Hija");
  });

  it("still answers with JSON when no format is asked for", async () => {
    const { app, projectId } = await setup();

    const response = await app.request(`/api/task/export/${projectId}`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
  });
});

/** Relee el `.xlsx` exportado y lo devuelve como CSV para reimportarlo. */
async function sheetToCsv(exported: ArrayBuffer): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(exported);
  const sheet = workbook.getWorksheet("Tareas");

  const width = sheet?.columnCount ?? 0;
  const rows: string[][] = [];
  sheet?.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    for (let column = 1; column <= width; column += 1) {
      const value = row.getCell(column).value;
      cells.push(
        value instanceof Date
          ? value.toISOString().slice(0, 10)
          : String(value ?? ""),
      );
    }
    rows.push(cells);
  });

  const [header, ...body] = rows;
  return csv(header ?? [], body);
}
