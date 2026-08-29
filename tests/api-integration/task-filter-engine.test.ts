import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import type { FilterNode } from "../../apps/api/src/view/filter-to-sql";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  childTreeValues,
  createProjectFixture,
  createWorkspaceMember,
  taskTreeValues,
} from "./helpers/fixtures";

// El traductor tiene sus unitarias, que comprueban la SQL que genera. Estas
// comprueban lo otro: que esa SQL corre en Postgres y devuelve las filas que
// debe. Es la diferencia entre "compila" y "funciona", y para los CASE con
// `jsonb_typeof` es justo donde se ve.

let taskNumber = 0;

async function setup() {
  const member = await createWorkspaceMember({ role: "admin" });
  const fixture = await createProjectFixture({
    workspaceId: member.workspace.id,
  });
  mockAuthenticatedSession(member.user);

  return {
    app: createApp().app,
    workspaceId: member.workspace.id,
    projectId: fixture.project.id,
    columnId: fixture.columns.todo.id,
    user: member.user,
  };
}

async function insertTask(
  projectId: string,
  columnId: string,
  overrides: Record<string, unknown> = {},
) {
  taskNumber += 1;

  const [task] = await db
    .insert(schema.taskTable)
    .values({
      ...taskTreeValues(),
      projectId,
      columnId,
      title: `Tarea ${taskNumber}`,
      status: "to-do",
      priority: "medium",
      number: taskNumber,
      position: taskNumber,
      ...overrides,
    })
    .returning();

  if (!task) throw new Error("Failed to seed task");
  return task;
}

async function defineField(
  workspaceId: string,
  projectId: string | null,
  key: string,
  type: string,
  config: Record<string, unknown> = {},
) {
  await db.insert(schema.fieldDefinitionTable).values({
    workspaceId,
    projectId,
    key,
    name: key,
    type,
    config,
  });
}

async function listTitles(
  app: ReturnType<typeof createApp>["app"],
  projectId: string,
  filter: FilterNode,
  treeScope?: "matching" | "roots" | "withDescendants",
) {
  const query = encodeURIComponent(JSON.stringify(filter));
  const scope = treeScope ? `&treeScope=${treeScope}` : "";
  const response = await app.request(
    `/api/task/tasks/${projectId}?filter=${query}${scope}`,
  );

  if (response.status !== 200) {
    return { status: response.status, titles: [] as string[] };
  }

  const body = await response.json();
  const titles = [
    ...body.data.columns.flatMap(
      (column: { tasks: Array<{ title: string }> }) => column.tasks,
    ),
    ...body.data.plannedTasks,
  ].map((task: { title: string }) => task.title);

  return { status: response.status, titles: titles.sort() };
}

describe("filter engine against Postgres", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    taskNumber = 0;
  });

  it("filters by a built-in column", async () => {
    const { app, projectId, columnId } = await setup();

    await insertTask(projectId, columnId, {
      title: "Urgente",
      priority: "urgent",
    });
    await insertTask(projectId, columnId, { title: "Normal", priority: "low" });

    const { titles } = await listTitles(app, projectId, {
      type: "condition",
      field: "priority",
      operator: "eq",
      value: "urgent",
    });

    expect(titles).toEqual(["Urgente"]);
  });

  // El caso que motiva la fase entera y que el indice GIN NO acelera.
  it("compares a currency custom field as a number", async () => {
    const { app, workspaceId, projectId, columnId } = await setup();
    await defineField(workspaceId, projectId, "presupuesto", "currency", {
      currency: "EUR",
    });

    await insertTask(projectId, columnId, {
      title: "Cara",
      customFields: { presupuesto: 5000 },
    });
    await insertTask(projectId, columnId, {
      title: "Barata",
      customFields: { presupuesto: 100 },
    });

    const { titles } = await listTitles(app, projectId, {
      type: "condition",
      field: "custom.presupuesto",
      operator: "gt",
      value: 1000,
    });

    expect(titles).toEqual(["Cara"]);
  });

  // La guarda de `jsonb_typeof`. Sin ella este caso no devuelve menos filas:
  // revienta la consulta entera con un error de conversion.
  it("survives a value of the wrong type sitting in the JSONB", async () => {
    const { app, workspaceId, projectId, columnId } = await setup();
    await defineField(workspaceId, projectId, "presupuesto", "number");

    await insertTask(projectId, columnId, {
      title: "Numerica",
      customFields: { presupuesto: 5000 },
    });
    // Un texto donde el campo dice numero: pasa al cambiar una definicion o
    // al importar un fichero torcido.
    await insertTask(projectId, columnId, {
      title: "Torcida",
      customFields: { presupuesto: "cinco mil" },
    });

    const { status, titles } = await listTitles(app, projectId, {
      type: "condition",
      field: "custom.presupuesto",
      operator: "gt",
      value: 1000,
    });

    expect(status).toBe(200);
    expect(titles).toEqual(["Numerica"]);
  });

  it("combines the tree of conditions with AND and OR", async () => {
    const { app, workspaceId, projectId, columnId } = await setup();
    await defineField(workspaceId, projectId, "presupuesto", "number");

    await insertTask(projectId, columnId, {
      title: "Cara y pendiente",
      status: "to-do",
      customFields: { presupuesto: 5000 },
    });
    await insertTask(projectId, columnId, {
      title: "Cara y hecha",
      status: "done",
      customFields: { presupuesto: 5000 },
    });
    await insertTask(projectId, columnId, {
      title: "Barata y pendiente",
      status: "to-do",
      customFields: { presupuesto: 10 },
    });

    // El ejemplo literal del plan: Presupuesto > 1000 AND estado != Hecho.
    const { titles } = await listTitles(app, projectId, {
      type: "and",
      children: [
        {
          type: "condition",
          field: "custom.presupuesto",
          operator: "gt",
          value: 1000,
        },
        { type: "condition", field: "status", operator: "neq", value: "done" },
      ],
    });

    expect(titles).toEqual(["Cara y pendiente"]);
  });

  // `neq` tiene que incluir las filas sin valor, que es lo que espera quien
  // escribe "estado distinto de hecho".
  it("includes rows with no value at all in neq", async () => {
    const { app, projectId, columnId } = await setup();

    await insertTask(projectId, columnId, {
      title: "Sin equipo",
      teamId: null,
    });

    const { titles } = await listTitles(app, projectId, {
      type: "condition",
      field: "team",
      operator: "neq",
      value: "algun-equipo",
    });

    expect(titles).toEqual(["Sin equipo"]);
  });

  it("filters by epic membership with an EXISTS", async () => {
    const { app, projectId, columnId } = await setup();

    const [epic] = await db
      .insert(schema.epicTable)
      .values({ projectId, name: "Migración" })
      .returning();

    if (!epic) throw new Error("Failed to seed epic");

    const inEpic = await insertTask(projectId, columnId, { title: "Dentro" });
    await insertTask(projectId, columnId, { title: "Fuera" });

    await db
      .insert(schema.taskEpicTable)
      .values({ taskId: inEpic.id, epicId: epic.id });

    const { titles } = await listTitles(app, projectId, {
      type: "condition",
      field: "epic",
      operator: "in",
      value: [epic.id],
    });

    expect(titles).toEqual(["Dentro"]);
  });

  it("filters a subtree branch by depth", async () => {
    const { app, projectId, columnId } = await setup();

    const parent = await insertTask(projectId, columnId, { title: "Padre" });
    await insertTask(projectId, columnId, {
      ...childTreeValues(parent),
      title: "Hija",
    });

    const { titles } = await listTitles(app, projectId, {
      type: "condition",
      field: "depth",
      operator: "gt",
      value: 0,
    });

    expect(titles).toEqual(["Hija"]);
  });

  it("finds text case-insensitively and treats wildcards as literals", async () => {
    const { app, workspaceId, projectId, columnId } = await setup();
    await defineField(workspaceId, projectId, "cliente", "text");

    await insertTask(projectId, columnId, {
      title: "Con comodin",
      customFields: { cliente: "50% de obra" },
    });
    await insertTask(projectId, columnId, {
      title: "Sin comodin",
      customFields: { cliente: "50 de obra" },
    });

    const { titles } = await listTitles(app, projectId, {
      type: "condition",
      field: "custom.cliente",
      operator: "contains",
      value: "50%",
    });

    expect(titles).toEqual(["Con comodin"]);
  });

  // Lo que el filtro hace con la jerarquia. Sin esto, filtrar una rama deja al
  // padre sin las hijas que no casan, que a veces es lo que se quiere y a
  // veces esconde justo lo que se buscaba.
  describe("alcance del arbol", () => {
    async function seedTree(
      workspaceId: string,
      projectId: string,
      columnId: string,
    ) {
      await defineField(workspaceId, projectId, "coste", "number");

      const parent = await insertTask(projectId, columnId, {
        title: "Padre caro",
        customFields: { coste: 5000 },
      });
      await insertTask(projectId, columnId, {
        ...childTreeValues(parent),
        title: "Hija barata",
        customFields: { coste: 10 },
      });
      await insertTask(projectId, columnId, {
        title: "Suelta barata",
        customFields: { coste: 20 },
      });

      return parent;
    }

    const caro: FilterNode = {
      type: "condition",
      field: "custom.coste",
      operator: "gt",
      value: 1000,
    };

    it("por defecto devuelve solo lo que casa", async () => {
      const { app, workspaceId, projectId, columnId } = await setup();
      await seedTree(workspaceId, projectId, columnId);

      const { titles } = await listTitles(app, projectId, caro);

      expect(titles).toEqual(["Padre caro"]);
    });

    it("withDescendants arrastra la rama de lo que casa", async () => {
      const { app, workspaceId, projectId, columnId } = await setup();
      await seedTree(workspaceId, projectId, columnId);

      const { titles } = await listTitles(
        app,
        projectId,
        caro,
        "withDescendants",
      );

      // La hija no casa por su cuenta; entra porque cuelga de una que si.
      expect(titles).toEqual(["Hija barata", "Padre caro"]);
    });

    it("withDescendants no arrastra ramas ajenas", async () => {
      const { app, workspaceId, projectId, columnId } = await setup();
      await seedTree(workspaceId, projectId, columnId);

      const { titles } = await listTitles(
        app,
        projectId,
        caro,
        "withDescendants",
      );

      expect(titles).not.toContain("Suelta barata");
    });

    it("roots deja fuera las hijas aunque casen", async () => {
      const { app, workspaceId, projectId, columnId } = await setup();
      await defineField(workspaceId, projectId, "coste", "number");

      const parent = await insertTask(projectId, columnId, {
        title: "Padre caro",
        customFields: { coste: 5000 },
      });
      await insertTask(projectId, columnId, {
        ...childTreeValues(parent),
        title: "Hija cara",
        customFields: { coste: 9000 },
      });

      const { titles } = await listTitles(app, projectId, caro, "roots");

      expect(titles).toEqual(["Padre caro"]);
    });

    it("un nieto tambien entra con withDescendants", async () => {
      const { app, workspaceId, projectId, columnId } = await setup();
      await defineField(workspaceId, projectId, "coste", "number");

      const parent = await insertTask(projectId, columnId, {
        title: "Padre caro",
        customFields: { coste: 5000 },
      });
      const child = await insertTask(projectId, columnId, {
        ...childTreeValues(parent),
        title: "Hija",
      });
      await insertTask(projectId, columnId, {
        ...childTreeValues(child),
        title: "Nieta",
      });

      const { titles } = await listTitles(
        app,
        projectId,
        caro,
        "withDescendants",
      );

      expect(titles).toEqual(["Hija", "Nieta", "Padre caro"]);
    });
  });

  // El fallo que esto arregla: comparar un array extrayendolo como texto nunca
  // casa, asi que filtrar por un multi_select no devolvia nada, en silencio.
  describe("selección múltiple", () => {
    async function seedTags(
      workspaceId: string,
      projectId: string,
      columnId: string,
    ) {
      await defineField(workspaceId, projectId, "etiquetas", "multi_select", {
        options: [
          { value: "obra", label: "Obra" },
          { value: "carpa", label: "Carpa" },
          { value: "oficina", label: "Oficina" },
        ],
      });

      await insertTask(projectId, columnId, {
        title: "Obra y carpa",
        customFields: { etiquetas: ["obra", "carpa"] },
      });
      await insertTask(projectId, columnId, {
        title: "Solo oficina",
        customFields: { etiquetas: ["oficina"] },
      });
      await insertTask(projectId, columnId, {
        title: "Sin etiquetas",
        customFields: {},
      });
    }

    it("encuentra las que contienen una opcion", async () => {
      const { app, workspaceId, projectId, columnId } = await setup();
      await seedTags(workspaceId, projectId, columnId);

      const { titles } = await listTitles(app, projectId, {
        type: "condition",
        field: "custom.etiquetas",
        operator: "eq",
        value: "carpa",
      });

      expect(titles).toEqual(["Obra y carpa"]);
    });

    it("encuentra las que contienen alguna de varias", async () => {
      const { app, workspaceId, projectId, columnId } = await setup();
      await seedTags(workspaceId, projectId, columnId);

      const { titles } = await listTitles(app, projectId, {
        type: "condition",
        field: "custom.etiquetas",
        operator: "in",
        value: ["carpa", "oficina"],
      });

      expect(titles).toEqual(["Obra y carpa", "Solo oficina"]);
    });

    it("excluye las que la contienen con neq", async () => {
      const { app, workspaceId, projectId, columnId } = await setup();
      await seedTags(workspaceId, projectId, columnId);

      const { titles } = await listTitles(app, projectId, {
        type: "condition",
        field: "custom.etiquetas",
        operator: "neq",
        value: "carpa",
      });

      expect(titles).toEqual(["Sin etiquetas", "Solo oficina"]);
    });

    it("distingue tener lista de no tenerla", async () => {
      const { app, workspaceId, projectId, columnId } = await setup();
      await seedTags(workspaceId, projectId, columnId);

      const vacias = await listTitles(app, projectId, {
        type: "condition",
        field: "custom.etiquetas",
        operator: "isEmpty",
      });
      expect(vacias.titles).toEqual(["Sin etiquetas"]);

      const llenas = await listTitles(app, projectId, {
        type: "condition",
        field: "custom.etiquetas",
        operator: "isNotEmpty",
      });
      expect(llenas.titles).toEqual(["Obra y carpa", "Solo oficina"]);
    });

    // Una lista vacia no es lo mismo que no tener el campo, pero para quien
    // filtra si lo es.
    it("trata una lista vacia como no tener nada", async () => {
      const { app, workspaceId, projectId, columnId } = await setup();
      await defineField(workspaceId, projectId, "etiquetas", "multi_select", {
        options: [{ value: "obra", label: "Obra" }],
      });

      await insertTask(projectId, columnId, {
        title: "Lista vacia",
        customFields: { etiquetas: [] },
      });

      const { titles } = await listTitles(app, projectId, {
        type: "condition",
        field: "custom.etiquetas",
        operator: "isEmpty",
      });

      expect(titles).toEqual(["Lista vacia"]);
    });

    // `jsonb_array_length` revienta si el valor no es un array, y eso pasa en
    // cuanto alguien cambie el tipo de un campo que ya tiene datos.
    it("sobrevive a un valor que no es una lista", async () => {
      const { app, workspaceId, projectId, columnId } = await setup();
      await defineField(workspaceId, projectId, "etiquetas", "multi_select", {
        options: [{ value: "obra", label: "Obra" }],
      });

      await insertTask(projectId, columnId, {
        title: "Torcida",
        customFields: { etiquetas: "obra" },
      });
      await insertTask(projectId, columnId, {
        title: "Correcta",
        customFields: { etiquetas: ["obra"] },
      });

      const { status, titles } = await listTitles(app, projectId, {
        type: "condition",
        field: "custom.etiquetas",
        operator: "isNotEmpty",
      });

      expect(status).toBe(200);
      expect(titles).toEqual(["Correcta"]);
    });
  });

  describe("errores", () => {
    it("answers 400 for a field that does not exist", async () => {
      const { app, projectId } = await setup();

      const { status } = await listTitles(app, projectId, {
        type: "condition",
        field: "custom.inventado",
        operator: "eq",
        value: "x",
      });

      expect(status).toBe(400);
    });

    it("answers 400 for an operator the field cannot take", async () => {
      const { app, projectId } = await setup();

      const { status } = await listTitles(app, projectId, {
        type: "condition",
        field: "dueDate",
        operator: "contains",
        value: "x",
      });

      expect(status).toBe(400);
    });

    it("answers 400 for a filter that is not valid JSON", async () => {
      const { app, projectId } = await setup();

      const response = await app.request(
        `/api/task/tasks/${projectId}?filter=%7Bnope`,
      );

      expect(response.status).toBe(400);
    });
  });

  it("leaves the inherited query untouched when no filter is sent", async () => {
    const { app, projectId, columnId } = await setup();

    await insertTask(projectId, columnId, { title: "Una" });
    await insertTask(projectId, columnId, { title: "Otra" });

    const response = await app.request(`/api/task/tasks/${projectId}`);
    const body = await response.json();
    const titles = body.data.columns
      .flatMap((column: { tasks: Array<{ title: string }> }) => column.tasks)
      .map((task: { title: string }) => task.title)
      .sort();

    expect(response.status).toBe(200);
    expect(titles).toEqual(["Otra", "Una"]);
  });

  // Un campo de espacio de trabajo se puede filtrar en cualquier proyecto.
  it("filters by a workspace-scoped field too", async () => {
    const { app, workspaceId, projectId, columnId } = await setup();
    await defineField(workspaceId, null, "cliente", "text");

    await insertTask(projectId, columnId, {
      title: "Bauhaus",
      customFields: { cliente: "BAUHAUS" },
    });
    await insertTask(projectId, columnId, {
      title: "Leroy",
      customFields: { cliente: "LEROY" },
    });

    const { titles } = await listTitles(app, projectId, {
      type: "condition",
      field: "custom.cliente",
      operator: "eq",
      value: "BAUHAUS",
    });

    expect(titles).toEqual(["Bauhaus"]);
  });
});
