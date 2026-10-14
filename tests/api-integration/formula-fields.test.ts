import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { settleEvents } from "../../apps/api/src/events";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

type Task = { id: string; customFields: Record<string, unknown> };

async function setup() {
  const ana = await createWorkspaceMember({ userName: "Ana", role: "admin" });
  const { project } = await createProjectFixture({
    workspaceId: ana.workspace.id,
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
  const defineField = (body: Record<string, unknown>) =>
    send("POST", `/api/field/project/${project.id}`, body);
  const defineWorkspaceField = (body: Record<string, unknown>) =>
    send("POST", `/api/field/workspace/${ana.workspace.id}`, body);
  const createTask = (body: Record<string, unknown> = {}) =>
    ok<Task>(
      send("POST", `/api/task/${project.id}`, {
        title: "Tarea",
        description: "",
        priority: "medium",
        status: "to-do",
        ...body,
      }),
    );
  const setValues = (taskId: string, values: Record<string, unknown>) =>
    send("PUT", `/api/task/custom-fields/${taskId}`, { values });
  const fieldsOf = async (taskId: string) => {
    const [row] = await db
      .select({ customFields: schema.taskTable.customFields })
      .from(schema.taskTable)
      .where(eq(schema.taskTable.id, taskId));
    return (row?.customFields ?? {}) as Record<string, unknown>;
  };
  return {
    ana,
    project,
    send,
    ok,
    defineField,
    defineWorkspaceField,
    createTask,
    setValues,
    fieldsOf,
  };
}

describe("API integration: calculated fields and help texts (ADR 090)", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("stores the formula with keys, keeps the help text and calculates existing tasks", async () => {
    const { ok, defineField, createTask, setValues, fieldsOf } = await setup();
    await ok(
      defineField({
        name: "Presupuesto",
        type: "currency",
        config: { currency: "EUR" },
        description: "Lo que paga el cliente por esta partida",
      }),
    );
    await ok(defineField({ name: "Horas previstas", type: "number" }));
    const task = await createTask();
    await ok(setValues(task.id, { presupuesto: 18400, horas_previstas: 64 }));

    const field = await ok<{
      key: string;
      description: string;
      config: Record<string, unknown>;
    }>(
      defineField({
        name: "Coste por hora",
        type: "formula",
        description: "Presupuesto entre horas previstas",
        config: {
          expression: "{Presupuesto} ÷ {Horas previstas}",
          format: "currency",
          currency: "EUR",
        },
      }),
    );

    expect(field.config).toEqual({
      expression: "{presupuesto} / {horas_previstas}",
      format: "currency",
      currency: "EUR",
    });
    expect(field.description).toBe("Presupuesto entre horas previstas");
    // La tarea ya existia: se calcula al crear el campo.
    expect((await fieldsOf(task.id)).coste_por_hora).toBe(287.5);
  });

  it("recalculates on every write, leaves the result empty when a value is missing and refuses manual values", async () => {
    const { ana, ok, send, defineField, createTask, setValues, fieldsOf } =
      await setup();
    await ok(defineField({ name: "Presupuesto", type: "number" }));
    await ok(defineField({ name: "Horas", type: "number" }));
    await ok(
      defineField({
        name: "Ratio",
        type: "formula",
        config: { expression: "{Presupuesto} / {Horas}" },
      }),
    );
    await ok(
      defineField({
        name: "Mayor",
        type: "formula",
        config: { expression: "max({Presupuesto}; {Horas})" },
      }),
    );
    const task = await createTask();

    // La respuesta ya lleva lo calculado: la celda no espera a la recarga.
    const updated = await ok<Task>(setValues(task.id, { presupuesto: 100 }));
    expect(updated.customFields.ratio).toBeUndefined();
    expect(updated.customFields.mayor).toBe(100);

    await ok(setValues(task.id, { horas: 8 }));
    expect(await fieldsOf(task.id)).toMatchObject({ ratio: 12.5, mayor: 100 });

    // Dividir por cero deja el resultado vacio, y la clave desaparece.
    await ok(setValues(task.id, { horas: 0 }));
    expect(await fieldsOf(task.id)).not.toHaveProperty("ratio");

    const manual = await setValues(task.id, { ratio: 3 });
    expect(manual.status).toBe(400);
    expect(await manual.text()).toContain("calculated field");
    const cleared = await setValues(task.id, { ratio: null });
    expect(cleared.status).toBe(400);

    // Ni obligatorio, ni de proyecto, ni con una formula que no se entiende.
    const required = await defineField({
      name: "Otro",
      type: "formula",
      required: true,
      config: { expression: "1" },
    });
    expect(required.status).toBe(400);
    const broken = await defineField({
      name: "Roto",
      type: "formula",
      config: { expression: "{Presupuesto} +" },
    });
    expect(broken.status).toBe(400);
    expect(await broken.text()).toContain(
      "Formula: The formula ends too early",
    );
    const unknown = await defineField({
      name: "Raro",
      type: "formula",
      config: { expression: "{Margen} * 2" },
    });
    expect(await unknown.text()).toContain('Unknown field "Margen"');
    const asProjectField = await send(
      "POST",
      `/api/field/workspace/${ana.workspace.id}`,
      {
        name: "X",
        type: "formula",
        entity: "project",
        config: { expression: "1" },
      },
    );
    expect(asProjectField.status).toBe(400);
  });

  it("sums the estimate and logged time of the whole branch, archived tasks aside", async () => {
    const { ok, send, defineWorkspaceField, createTask, fieldsOf } =
      await setup();
    await ok(
      defineWorkspaceField({
        name: "Pendiente",
        type: "formula",
        config: { expression: "{Estimado} - {Registrado}" },
      }),
    );

    const parent = await createTask({ title: "Fase", estimate: 3600 });
    expect((await fieldsOf(parent.id)).pendiente).toBe(1);

    const child = await createTask({
      title: "Hija",
      parentId: parent.id,
      estimate: 7200,
    });
    expect((await fieldsOf(parent.id)).pendiente).toBe(3);
    expect((await fieldsOf(child.id)).pendiente).toBe(2);

    // Cambiar la estimacion de la hija rehace la del padre.
    await ok(
      send("PUT", `/api/task/estimate/${child.id}`, { estimate: 10800 }),
    );
    expect((await fieldsOf(parent.id)).pendiente).toBe(4);

    // Media hora registrada en la hija cuenta en las dos.
    await ok(
      send("POST", "/api/time-entry", {
        taskId: child.id,
        startTime: "2026-10-01T08:00:00.000Z",
        endTime: "2026-10-01T08:30:00.000Z",
      }),
    );
    expect((await fieldsOf(child.id)).pendiente).toBe(2.5);
    expect((await fieldsOf(parent.id)).pendiente).toBe(3.5);

    // Archivada, la hija sale de la rama del padre, pero no de la suya.
    await ok(
      send("PUT", `/api/task/status/${child.id}`, { status: "archived" }),
    );
    expect((await fieldsOf(parent.id)).pendiente).toBe(1);
    expect((await fieldsOf(child.id)).pendiente).toBe(2.5);
    await ok(send("PUT", `/api/task/status/${child.id}`, { status: "to-do" }));
    expect((await fieldsOf(parent.id)).pendiente).toBe(3.5);

    // Soltarla de la rama devuelve al padre a lo suyo.
    await ok(send("PUT", `/api/task/parent/${child.id}`, { parentId: null }));
    expect((await fieldsOf(parent.id)).pendiente).toBe(1);

    await ok(
      send("PUT", `/api/task/parent/${child.id}`, { parentId: parent.id }),
    );
    expect((await fieldsOf(parent.id)).pendiente).toBe(3.5);
    await ok(send("DELETE", `/api/task/${child.id}`));
    expect((await fieldsOf(parent.id)).pendiente).toBe(1);

    await settleEvents();
  });

  it("lets a formula read another one and refuses a cycle", async () => {
    const { ok, send, defineField, createTask, setValues, fieldsOf } =
      await setup();
    await ok(defineField({ name: "Presupuesto", type: "number" }));
    const coste = await ok<{ id: string }>(
      defineField({
        name: "Coste",
        type: "formula",
        config: { expression: "{Presupuesto} * 0,8" },
      }),
    );
    await ok(
      defineField({
        name: "Margen",
        type: "formula",
        config: { expression: "{Presupuesto} - {Coste}", format: "number" },
      }),
    );
    const task = await createTask();
    await ok(setValues(task.id, { presupuesto: 1000 }));
    expect(await fieldsOf(task.id)).toMatchObject({ coste: 800, margen: 200 });

    const cycle = await send("PATCH", `/api/field/${coste.id}`, {
      config: { expression: "{Margen} + 1" },
    });
    expect(cycle.status).toBe(400);
    expect(await cycle.text()).toContain("ends up reading itself");
    const self = await send("PATCH", `/api/field/${coste.id}`, {
      config: { expression: "{Coste} + 1" },
    });
    expect(await self.text()).toContain("cannot read itself");

    // Cambiar la formula recalcula todas las tareas, tambien las que la leen.
    await ok(
      send("PATCH", `/api/field/${coste.id}`, {
        config: { expression: "{Presupuesto} / 2" },
      }),
    );
    expect(await fieldsOf(task.id)).toMatchObject({ coste: 500, margen: 500 });
  });

  it("keeps a field that a formula reads from being archived or deleted", async () => {
    const { ok, send, defineField } = await setup();
    const presupuesto = await ok<{ id: string }>(
      defineField({ name: "Presupuesto", type: "number" }),
    );
    const doble = await ok<{ id: string }>(
      defineField({
        name: "Doble",
        type: "formula",
        config: { expression: "{Presupuesto} * 2" },
      }),
    );

    const archived = await send("PATCH", `/api/field/${presupuesto.id}`, {
      archived: true,
    });
    expect(archived.status).toBe(409);
    expect(await archived.text()).toContain('"Doble" reads this field');
    expect((await send("DELETE", `/api/field/${presupuesto.id}`)).status).toBe(
      409,
    );

    // Sin la formula ya se puede.
    await ok(send("DELETE", `/api/field/${doble.id}`));
    await ok(send("DELETE", `/api/field/${presupuesto.id}`));
  });

  it("lets a template carry the inputs and recalculates instead of copying the result", async () => {
    const { ok, send, project, defineField, createTask, setValues } =
      await setup();
    await ok(defineField({ name: "Horas", type: "number" }));
    await ok(
      defineField({
        name: "Coste",
        type: "formula",
        config: { expression: "{Horas} * 30" },
      }),
    );
    const source = await createTask({ title: "Revisión mensual" });
    await ok(setValues(source.id, { horas: 4 }));

    const template = await ok<{ id: string }>(
      send("POST", `/api/template/from-task/${source.id}`, {
        name: "Revisión",
      }),
    );
    // Sin el filtro de plantillas, el valor calculado viajaba y aplicar
    // devolvia un 400: un calculado no se escribe.
    await ok(
      send("POST", `/api/template/${template.id}/apply`, {
        projectId: project.id,
      }),
    );

    const copies = await db
      .select({ customFields: schema.taskTable.customFields })
      .from(schema.taskTable)
      .where(eq(schema.taskTable.title, "Revisión mensual"));
    expect(copies).toHaveLength(2);
    for (const copy of copies) {
      expect(copy.customFields).toMatchObject({ horas: 4, coste: 120 });
    }
  });

  it("filters by a calculated field like any other number", async () => {
    const { ok, send, project, defineField, createTask, setValues } =
      await setup();
    await ok(defineField({ name: "Horas", type: "number" }));
    await ok(
      defineField({
        name: "Coste",
        type: "formula",
        config: { expression: "{Horas} * 30" },
      }),
    );
    const cheap = await createTask({ title: "Barata" });
    const dear = await createTask({ title: "Cara" });
    await ok(setValues(cheap.id, { horas: 2 }));
    await ok(setValues(dear.id, { horas: 10 }));

    const filter = {
      type: "condition",
      field: "custom.coste",
      operator: "gt",
      value: 100,
    };
    const listed = await ok<{
      data: { columns: Array<{ tasks: Array<{ title: string }> }> };
    }>(
      send(
        "GET",
        `/api/task/tasks/${project.id}?filter=${encodeURIComponent(JSON.stringify(filter))}`,
      ),
    );
    expect(
      listed.data.columns.flatMap((column) => column.tasks.map((t) => t.title)),
    ).toEqual(["Cara"]);
  });
});
