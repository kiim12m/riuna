import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { settleEvents } from "../../apps/api/src/events";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  addWorkspaceMember,
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

async function setup() {
  const ana = await createWorkspaceMember({ userName: "Ana", role: "admin" });
  const luis = await addWorkspaceMember(ana.workspace.id, "member");
  const { project: alcala } = await createProjectFixture({
    workspaceId: ana.workspace.id,
  });
  const { project: coslada } = await createProjectFixture({
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
    send("POST", `/api/field/workspace/${ana.workspace.id}`, {
      entity: "project",
      ...body,
    });
  const setValues = (projectId: string, values: Record<string, unknown>) =>
    send("PUT", `/api/project/${projectId}/custom-fields`, { values });
  const list = (filter?: unknown) => {
    const query = new URLSearchParams({ workspaceId: ana.workspace.id });
    if (filter) query.set("filter", JSON.stringify(filter));
    return send("GET", `/api/project?${query}`);
  };
  return { ana, luis, alcala, coslada, send, ok, defineField, setValues, list };
}

describe("API integration: project fields and portfolio (ADR 088)", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("keeps project fields apart from task fields, even with the same name", async () => {
    const { ana, alcala, send, ok, defineField } = await setup();
    await ok(
      defineField({
        name: "Presupuesto",
        type: "currency",
        config: { currency: "EUR" },
      }),
    );
    // El mismo nombre, como campo de tarea del espacio.
    await ok(
      send("POST", `/api/field/workspace/${ana.workspace.id}`, {
        name: "Presupuesto",
        type: "number",
      }),
    );

    const projectFields = await ok<Array<{ key: string; entity: string }>>(
      send("GET", `/api/field/workspace/${ana.workspace.id}?entity=project`),
    );
    const taskFields = await ok<Array<{ key: string; entity: string }>>(
      send("GET", `/api/field/workspace/${ana.workspace.id}`),
    );
    expect(projectFields.map((field) => [field.key, field.entity])).toEqual([
      ["presupuesto", "project"],
    ]);
    expect(taskFields.map((field) => [field.key, field.entity])).toEqual([
      ["presupuesto", "task"],
    ]);

    // Las tareas de un proyecto no ven el campo de proyecto.
    const forTasks = await ok<Array<{ type: string }>>(
      send("GET", `/api/field/project/${alcala.id}`),
    );
    expect(forTasks.map((field) => field.type)).toEqual(["number"]);

    expect((await defineField({ name: "Obra", type: "relation" })).status).toBe(
      400,
    );
  });

  it("validates and keeps a project's field values, and leaves a trace", async () => {
    const { alcala, send, ok, defineField, setValues } = await setup();
    await ok(
      defineField({
        name: "Presupuesto",
        type: "currency",
        config: { currency: "EUR" },
      }),
    );
    await ok(
      defineField({
        name: "Tipo de obra",
        type: "select",
        config: {
          options: [
            { value: "industrial", label: "Industrial" },
            { value: "publica", label: "Pública" },
          ],
        },
      }),
    );

    expect((await setValues(alcala.id, { presupuesto: "mucho" })).status).toBe(
      400,
    );
    expect((await setValues(alcala.id, { tipo_de_obra: "naval" })).status).toBe(
      400,
    );

    const updated = await ok<{ customFields: Record<string, unknown> }>(
      setValues(alcala.id, { presupuesto: 96000, tipo_de_obra: "industrial" }),
    );
    expect(updated.customFields).toEqual({
      presupuesto: 96000,
      tipo_de_obra: "industrial",
    });
    // Parcial: lo que no llega se queda, y vacio borra.
    const cleared = await ok<{ customFields: Record<string, unknown> }>(
      setValues(alcala.id, { tipo_de_obra: null }),
    );
    expect(cleared.customFields).toEqual({ presupuesto: 96000 });

    await settleEvents();
    const activity = await ok<Array<{ type: string }>>(
      send("GET", `/api/project/${alcala.id}/activity`),
    );
    expect(activity.map((entry) => entry.type)).toEqual([
      "fields_changed",
      "fields_changed",
    ]);
  });

  it("only lets those who can configure a project fill its fields", async () => {
    const { luis, alcala, ok, defineField } = await setup();
    await ok(defineField({ name: "Cliente", type: "text" }));
    mockAuthenticatedSession(luis);
    const response = await createApp().app.request(
      `/api/project/${alcala.id}/custom-fields`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ values: { cliente: "Logística Henares" } }),
      },
    );
    expect(response.status).toBe(403);
  });

  it("filters the list with the views' engine, over fields, health and progress", async () => {
    const { alcala, coslada, send, ok, defineField, setValues, list } =
      await setup();
    await ok(defineField({ name: "Presupuesto", type: "number" }));
    await ok(setValues(alcala.id, { presupuesto: 96000 }));
    await ok(setValues(coslada.id, { presupuesto: 21500 }));
    await ok(
      send("PATCH", `/api/project/${coslada.id}/status`, {
        health: "off_track",
      }),
    );
    // Una tarea hecha de dos en Alcala: 50 %.
    for (const status of ["to-do", "done"]) {
      await ok(
        send("POST", `/api/task/${alcala.id}`, {
          title: status,
          description: "",
          priority: "medium",
          status,
        }),
      );
    }

    const ids = async (filter: unknown) =>
      (await ok<Array<{ id: string }>>(list(filter))).map(
        (project) => project.id,
      );

    expect(
      await ids({
        type: "condition",
        field: "custom.presupuesto",
        operator: "gt",
        value: 50000,
      }),
    ).toEqual([alcala.id]);
    expect(
      await ids({
        type: "condition",
        field: "health",
        operator: "in",
        value: ["at_risk", "off_track"],
      }),
    ).toEqual([coslada.id]);
    expect(
      await ids({
        type: "condition",
        field: "progress",
        operator: "gte",
        value: 50,
      }),
    ).toEqual([alcala.id]);
    expect(
      (
        await list({
          type: "condition",
          field: "status",
          operator: "eq",
          value: "x",
        })
      ).status,
    ).toBe(400);
  });

  it("exports the filtered list to a spreadsheet, values as they read", async () => {
    const { ana, alcala, send, ok, defineField, setValues } = await setup();
    await ok(
      defineField({
        name: "Tipo de obra",
        type: "select",
        config: { options: [{ value: "industrial", label: "Industrial" }] },
      }),
    );
    await ok(setValues(alcala.id, { tipo_de_obra: "industrial" }));
    await ok(
      send("PATCH", `/api/project/${alcala.id}/status`, { health: "at_risk" }),
    );

    const filter = {
      type: "condition",
      field: "health",
      operator: "eq",
      value: "at_risk",
    };
    const response = await send(
      "GET",
      `/api/project/export?${new URLSearchParams({
        workspaceId: ana.workspace.id,
        filter: JSON.stringify(filter),
      })}`,
    );
    expect(response.status).toBe(200);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await response.arrayBuffer());
    const sheet = workbook.getWorksheet("Proyectos");
    if (!sheet) throw new Error("No sheet");
    const header = (sheet.getRow(1).values as unknown[]).slice(1);
    expect(header).toContain("Tipo de obra");
    expect(sheet.rowCount).toBe(2);
    const row = (sheet.getRow(2).values as unknown[]).slice(1);
    expect(row[2]).toBe("En riesgo");
    expect(row[header.indexOf("Tipo de obra")]).toBe("Industrial");
  });

  it("saves portfolio views in the workspace, never in a project", async () => {
    const { ana, alcala, send, ok } = await setup();
    const config = {
      filter: [{ id: "c1", field: "health", operator: "eq", value: "at_risk" }],
      show: "mine",
    };
    const saved = await ok<{ type: string; config: unknown }>(
      send("POST", `/api/view/workspace?workspaceId=${ana.workspace.id}`, {
        name: "Mis obras en riesgo",
        type: "portfolio",
        config,
      }),
    );
    expect(saved.type).toBe("portfolio");
    expect(saved.config).toEqual(config);

    const inProject = await send("POST", `/api/view/project/${alcala.id}`, {
      name: "Mal",
      type: "portfolio",
    });
    expect(inProject.status).toBe(400);

    const rows = await db.select().from(schema.viewTable);
    expect(rows).toHaveLength(1);
  });
});
