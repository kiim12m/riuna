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

type DataResponse = {
  widgets: Array<
    | {
        id: string;
        data: {
          buckets?: Array<{
            key: string | null;
            value: number;
            total?: number;
          }>;
          truncated?: boolean;
          labels?: Record<string, { label: string }>;
          rows?: Array<{ id: string; title: string }>;
        };
      }
    | { id: string; error: string }
  >;
};

let taskCounter = 0;

describe("API integration: dashboard aggregates", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    taskCounter = 0;
  });

  async function createTask({
    projectId,
    status = "to-do",
    priority = "medium",
    assigneeId,
    dueDate,
    estimate,
  }: {
    projectId: string;
    status?: string;
    priority?: string;
    assigneeId?: string;
    dueDate?: Date | null;
    estimate?: number;
  }) {
    taskCounter += 1;

    const [task] = await db
      .insert(schema.taskTable)
      .values({
        ...taskTreeValues(),
        projectId,
        title: `Tarea ${taskCounter}`,
        status,
        priority,
        number: taskCounter,
        position: taskCounter,
        userId: assigneeId ?? null,
        dueDate: dueDate ?? null,
        estimate: estimate ?? 0,
      })
      .returning();

    return task;
  }

  async function setup() {
    const member = await createWorkspaceMember({ role: "member" });
    const { project, columns } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });

    const [dashboard] = await db
      .insert(schema.dashboardTable)
      .values({
        workspaceId: member.workspace.id,
        createdBy: member.user.id,
        name: "Panel",
      })
      .returning();

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    return { member, project, columns, dashboard, app };
  }

  async function addWidget(
    app: ReturnType<typeof createApp>["app"],
    dashboardId: string,
    body: Record<string, unknown>,
  ) {
    const response = await app.request(`/api/dashboard/${dashboardId}/widget`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    expect(response.status).toBe(200);
    return ((await response.json()) as { id: string }).id;
  }

  async function readData(
    app: ReturnType<typeof createApp>["app"],
    dashboardId: string,
  ) {
    const response = await app.request(`/api/dashboard/${dashboardId}/data`, {
      method: "POST",
    });
    expect(response.status).toBe(200);
    return (await response.json()) as DataResponse;
  }

  function bucketsOf(payload: DataResponse, id: string) {
    const entry = payload.widgets.find((widget) => widget.id === id);
    if (!entry || "error" in entry) {
      throw new Error(`expected data for ${id}, got ${JSON.stringify(entry)}`);
    }
    return entry.data;
  }

  it("counts the tasks that survive the scope", async () => {
    const { project, dashboard, app } = await setup();

    await createTask({ projectId: project.id });
    await createTask({ projectId: project.id, status: "done" });
    // Una archivada no entra en ningun agregado.
    await createTask({ projectId: project.id, status: "archived" });

    const id = await addWidget(app, dashboard.id, {
      type: "count",
      title: "Total",
      config: { metric: "count" },
    });

    const data = bucketsOf(await readData(app, dashboard.id), id);
    expect(data.buckets?.[0]?.value).toBe(2);
  });

  it("groups by done, which is the cross-project substitute for status", async () => {
    const { project, dashboard, app } = await setup();

    await createTask({ projectId: project.id });
    await createTask({ projectId: project.id, status: "done" });
    await createTask({ projectId: project.id, status: "done" });

    const id = await addWidget(app, dashboard.id, {
      type: "breakdown",
      title: "Hechas",
      config: { groupBy: "done" },
    });

    const data = bucketsOf(await readData(app, dashboard.id), id);
    const byKey = new Map(
      (data.buckets ?? []).map((bucket) => [bucket.key, bucket.value]),
    );

    expect(byKey.get("true")).toBe(2);
    expect(byKey.get("false")).toBe(1);
  });

  it("buckets due dates around the server's today", async () => {
    const { project, dashboard, app } = await setup();

    const day = 86_400_000;
    await createTask({
      projectId: project.id,
      dueDate: new Date(Date.now() - 3 * day),
    });
    await createTask({
      projectId: project.id,
      dueDate: new Date(Date.now() + 2 * day),
    });
    await createTask({ projectId: project.id, dueDate: null });

    const id = await addWidget(app, dashboard.id, {
      type: "breakdown",
      title: "Vencimiento",
      config: { groupBy: "dueWindow" },
    });

    const data = bucketsOf(await readData(app, dashboard.id), id);
    const byKey = new Map(
      (data.buckets ?? []).map((bucket) => [bucket.key, bucket.value]),
    );

    expect(byKey.get("overdue")).toBe(1);
    expect(byKey.get("week")).toBe(1);
    expect(byKey.get("none")).toBe(1);
  });

  it("does not count a task once per time entry", async () => {
    const { member, project, dashboard, app } = await setup();

    const task = await createTask({ projectId: project.id });

    // Dos entradas sobre la misma tarea. Si el agregado de recuento arrastrase
    // la union de `time_entry`, esta tarea contaria dos veces.
    for (const seconds of [1_800, 3_600]) {
      await db.insert(schema.timeEntryTable).values({
        taskId: task.id,
        userId: member.user.id,
        startTime: new Date(),
        endTime: new Date(Date.now() + seconds * 1000),
        duration: seconds,
      });
    }

    const countId = await addWidget(app, dashboard.id, {
      type: "count",
      title: "Total",
      config: { metric: "count" },
    });
    const timeId = await addWidget(app, dashboard.id, {
      type: "time",
      title: "Tiempo",
      config: { groupBy: "assignee" },
    });

    const payload = await readData(app, dashboard.id);

    expect(bucketsOf(payload, countId).buckets?.[0]?.value).toBe(1);
    // Y el de tiempo si suma las dos: su grano es la entrada, no la tarea.
    expect(bucketsOf(payload, timeId).buckets?.[0]?.value).toBe(5_400);
  });

  // Agrupar el tiempo registrado por fecha repetia la clave con parametros en el
  // GROUP BY y moria con "must appear in the GROUP BY clause". Y sin ventana
  // se habria quedado con los 90 cubos mas antiguos, no con los recientes.
  it("groups logged time by date over the recent window", async () => {
    const { member, project, dashboard, app } = await setup();
    const task = await createTask({ projectId: project.id });

    const DAY = 86_400_000;
    for (const [daysAgo, seconds] of [
      [0, 3_600],
      [400, 1_800],
    ] as const) {
      const startTime = new Date(Date.now() - daysAgo * DAY);
      await db.insert(schema.timeEntryTable).values({
        taskId: task.id,
        userId: member.user.id,
        startTime,
        endTime: new Date(startTime.getTime() + seconds * 1000),
        duration: seconds,
      });
    }

    const timeId = await addWidget(app, dashboard.id, {
      type: "time",
      title: "Por dia",
      config: { groupBy: "time", granularity: "day" },
    });

    const payload = await readData(app, dashboard.id);

    expect(bucketsOf(payload, timeId).buckets?.map((b) => b.value)).toEqual([
      3_600,
    ]);
  });

  it("counts a task in every epic it belongs to, so buckets can outsum the total", async () => {
    const { project, dashboard, app } = await setup();

    const [first, second] = await db
      .insert(schema.epicTable)
      .values([
        { projectId: project.id, name: "Alfa", position: 0 },
        { projectId: project.id, name: "Beta", position: 1 },
      ])
      .returning();

    const shared = await createTask({ projectId: project.id, status: "done" });
    const only = await createTask({ projectId: project.id });

    await db.insert(schema.taskEpicTable).values([
      { taskId: shared.id, epicId: first.id },
      { taskId: shared.id, epicId: second.id },
      { taskId: only.id, epicId: first.id },
    ]);

    const id = await addWidget(app, dashboard.id, {
      type: "epic_progress",
      title: "Avance",
      projectId: project.id,
      config: {},
    });

    const data = bucketsOf(await readData(app, dashboard.id), id);
    const byKey = new Map(
      (data.buckets ?? []).map((bucket) => [bucket.key, bucket]),
    );

    expect(byKey.get(first.id)?.total).toBe(2);
    expect(byKey.get(first.id)?.value).toBe(1);
    expect(byKey.get(second.id)?.total).toBe(1);

    // Dos tareas, tres pertenencias: los cubos suman por encima del total, y es
    // correcto. Por eso la tarta saca su 100 % de la suma de los cubos.
    const summed = (data.buckets ?? []).reduce(
      (total, bucket) => total + (bucket.total ?? 0),
      0,
    );
    expect(summed).toBe(3);
  });

  it("returns a top-N list for a table widget", async () => {
    const { project, dashboard, app } = await setup();

    await createTask({
      projectId: project.id,
      dueDate: new Date("2030-01-01"),
    });
    await createTask({
      projectId: project.id,
      dueDate: new Date("2026-01-01"),
    });

    const id = await addWidget(app, dashboard.id, {
      type: "table",
      title: "Proximas",
      config: {},
    });

    const data = bucketsOf(await readData(app, dashboard.id), id);

    expect(data.rows).toHaveLength(2);
    // Vence antes primero, como en "Mi trabajo".
    expect(data.rows?.[0]?.title).toBe("Tarea 2");
  });

  it("carries a broken widget's error without failing the panel", async () => {
    const { member, project, dashboard, app } = await setup();

    await createTask({ projectId: project.id });

    const healthy = await addWidget(app, dashboard.id, {
      type: "count",
      title: "Sano",
      config: {},
    });

    // Un filtro que nombra un campo que el registro no conoce: es lo que pasa
    // cuando alguien retira la definicion que el widget filtraba.
    const [broken] = await db
      .insert(schema.dashboardWidgetTable)
      .values({
        dashboardId: dashboard.id,
        type: "count",
        title: "Roto",
        config: {
          filter: [
            {
              id: "a",
              field: "custom.desaparecido",
              operator: "eq",
              value: "x",
            },
          ],
        },
      })
      .returning();

    const payload = await readData(app, dashboard.id);

    expect(payload.widgets).toHaveLength(2);
    expect(bucketsOf(payload, healthy).buckets?.[0]?.value).toBe(1);

    const brokenEntry = payload.widgets.find(
      (widget) => widget.id === broken.id,
    );
    expect(brokenEntry && "error" in brokenEntry).toBe(true);

    expect(member.workspace.id).toBeTruthy();
  });

  it("returns nothing for a widget scoped to a project of another workspace", async () => {
    const { project, dashboard, app } = await setup();
    await createTask({ projectId: project.id });

    const stranger = await createWorkspaceMember({ role: "member" });
    const foreign = await createProjectFixture({
      workspaceId: stranger.workspace.id,
    });
    await createTask({ projectId: foreign.project.id });

    // Escrito directamente en la base, saltandose la comprobacion del
    // controlador: es la garantia de que el ambito de la consulta, y no solo la
    // validacion de escritura, impide leer de otro espacio.
    const [widget] = await db
      .insert(schema.dashboardWidgetTable)
      .values({
        dashboardId: dashboard.id,
        projectId: foreign.project.id,
        type: "count",
        title: "Ajeno",
        config: {},
      })
      .returning();

    const data = bucketsOf(await readData(app, dashboard.id), widget.id);

    expect(data.buckets?.[0]?.value).toBe(0);
  });
});
