import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../apps/api/src/index";
import { buildPortfolioPdf } from "../../apps/api/src/pdf/portfolio";
import { buildTaskPdf } from "../../apps/api/src/pdf/task";
import { buildTaskListPdf } from "../../apps/api/src/pdf/task-list";
import { buildTimeSheetPdf } from "../../apps/api/src/pdf/time-sheet";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

type Task = { id: string; number: number };

/** Todo el texto de una definicion de pdfmake, para buscar en ella. */
const textOf = (document: unknown) => JSON.stringify(document);

async function setup() {
  const ana = await createWorkspaceMember({
    userName: "Ana Ruiz",
    role: "admin",
  });
  const { project } = await createProjectFixture({
    workspaceId: ana.workspace.id,
    name: "Reforma nave",
  });
  mockAuthenticatedSession(ana.user);
  const app = createApp().app;
  const send = (method: string, path: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const ok = async <T = Record<string, unknown>>(
    pending: Promise<Response>,
  ) => {
    const response = await pending;
    if (response.status !== 200) {
      throw new Error(`${response.status} ${await response.text()}`);
    }
    return response.json() as Promise<T>;
  };
  const createTask = (body: Record<string, unknown>) =>
    ok<Task>(
      send("POST", `/api/task/${project.id}`, {
        description: "",
        priority: "medium",
        status: "to-do",
        ...body,
      }),
    );

  await ok(
    send("POST", `/api/field/project/${project.id}`, {
      name: "Presupuesto",
      type: "currency",
      config: { currency: "EUR" },
    }),
  );
  await ok(
    send("POST", `/api/field/project/${project.id}`, {
      name: "Coste por hora",
      type: "formula",
      config: {
        expression: "{Presupuesto} / {Estimado}",
        format: "currency",
        currency: "EUR",
      },
    }),
  );

  const phase = await createTask({
    title: "Instalación eléctrica",
    description: "Cableado de la nave según la **memoria técnica**.",
    estimate: 64 * 3600,
  });
  const child = await createTask({
    title: "Tendido de cableado",
    parentId: phase.id,
    estimate: 40 * 3600,
  });
  await createTask({ title: "Acta de replanteo" });
  await ok(
    send("PUT", `/api/task/custom-fields/${phase.id}`, {
      values: { presupuesto: 18400 },
    }),
  );
  await ok(
    send("POST", `/api/comment/${phase.id}`, {
      content: "El cuadro llega el 28.",
    }),
  );
  await ok(
    send("POST", "/api/time-entry", {
      taskId: child.id,
      startTime: "2026-10-05T06:30:00.000Z",
      endTime: "2026-10-05T09:00:00.000Z",
    }),
  );

  return { ana, project, send, ok, phase, child };
}

async function expectPdf(response: Response, filename: RegExp) {
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("application/pdf");
  expect(response.headers.get("content-disposition")).toMatch(filename);
  const bytes = new Uint8Array(await response.arrayBuffer());
  expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
}

describe("API integration: PDF export (ADR 091)", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("prints a task with its fields, description, subtasks and comments", async () => {
    const { send, project, phase } = await setup();
    const key = `${project.slug.toUpperCase()}-${phase.number}`;

    await expectPdf(
      await send("GET", `/api/task/${phase.id}/pdf`),
      new RegExp(`${key}-instalacion-electrica\\.pdf`),
    );

    const { document } = await buildTaskPdf(phase.id, "Ana Ruiz");
    const text = textOf(document);
    expect(text).toContain(`${key} · Instalación eléctrica`);
    expect(text).toContain("Prioridad media");
    // El calculado, con su formato: 18.400 € entre las 104 h de la rama.
    expect(text).toMatch(/176,92\s€/);
    expect(text).toMatch(/18\.400,00\s€/);
    expect(text).toContain("Cableado de la nave según la memoria técnica.");
    expect(text).toContain("Tendido de cableado");
    expect(text).toContain("El cuadro llega el 28.");
    // El pie lo pinta pdfmake en cada pagina: es una funcion.
    const footer = (
      document.footer as (page: number, pages: number) => unknown
    )(1, 2);
    expect(textOf(footer)).toContain("Riuna · Ana Ruiz");
    expect(textOf(footer)).toContain("Página 1 de 2");
  });

  it("prints a view with its filter, the Table's columns and the totals", async () => {
    const { send, project } = await setup();
    const filter = {
      type: "condition",
      field: "title",
      operator: "contains",
      value: "a",
    };
    const query = new URLSearchParams({
      format: "pdf",
      filter: JSON.stringify(filter),
      columns:
        "title,status,custom.presupuesto,custom.coste_por_hora,agg.estimate",
      title: "Tabla · Obra en curso",
      subtitle: "Título contiene a",
    });
    await expectPdf(
      await send("GET", `/api/task/export/${project.id}?${query}`),
      /tareas-.*\.pdf/,
    );

    const { document } = await buildTaskListPdf(
      project.id,
      {
        filter: {
          type: "condition",
          field: "title",
          operator: "contains",
          value: "cableado",
        },
        columns: [
          "title",
          "custom.presupuesto",
          "custom.coste_por_hora",
          "estimate",
        ],
        title: "Tabla · Obra en curso",
      },
      "Ana Ruiz",
    );
    const text = textOf(document);
    expect(text).toContain("Tabla · Obra en curso");
    expect(text).toContain("Tendido de cableado");
    expect(text).not.toContain("Acta de replanteo");
    expect(text).toContain("ƒ Coste por hora");
    expect(text).toContain("1 tarea");
    expect(text).toContain("40 h");

    // Una columna que ya no existe se ignora en vez de fallar.
    const unknown = await send(
      "GET",
      `/api/task/export/${project.id}?format=pdf&columns=title,custom.borrado`,
    );
    expect(unknown.status).toBe(200);
  });

  it("prints the time sheet with the workday and room for two signatures", async () => {
    const { ana, send } = await setup();
    const query = new URLSearchParams({
      workspaceId: ana.workspace.id,
      start: "2026-10-05",
      end: "2026-10-09",
      format: "pdf",
    });
    await expectPdf(
      await send("GET", `/api/time-sheet/export?${query}`),
      /parte-de-horas-2026-10-05-2026-10-09\.pdf/,
    );

    const { document } = await buildTimeSheetPdf({
      workspaceId: ana.workspace.id,
      userId: ana.user.id,
      windowStart: new Date("2026-10-05T00:00:00"),
      windowEnd: new Date("2026-10-09T23:59:59"),
      groupBy: "day",
    });
    const text = textOf(document);
    expect(text).toContain("Parte de horas · Ana Ruiz");
    expect(text).toContain("Tendido de cableado");
    expect(text).toContain("8:30");
    expect(text).toContain("2 h 30 min");
    expect(text).toContain("Jornada");
    expect(text).toContain("Firma de la persona");
    expect(text).toContain("Visto bueno del responsable");
  });

  it("prints the portfolio and keeps every document inside its workspace", async () => {
    const { ana, send, phase } = await setup();
    await expectPdf(
      await send(
        "GET",
        `/api/project/export?workspaceId=${ana.workspace.id}&format=pdf`,
      ),
      /proyectos-.*\.pdf/,
    );
    const { document } = await buildPortfolioPdf(
      ana.workspace.id,
      { filter: null },
      "Ana Ruiz",
    );
    expect(textOf(document)).toContain("Reforma nave");

    // Alguien de otro espacio no saca la tarea de este.
    const luis = await createWorkspaceMember({
      userName: "Luis",
      role: "admin",
    });
    mockAuthenticatedSession(luis.user);
    const denied = await send("GET", `/api/task/${phase.id}/pdf`);
    expect([403, 404]).toContain(denied.status);
  });
});
