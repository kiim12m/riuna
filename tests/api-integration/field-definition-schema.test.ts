import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
  taskTreeValues,
} from "./helpers/fixtures";

// Las invariantes de la capa de datos de la Fase 3, contra Postgres de verdad.
// Las dos claves unicas son parciales y la restriccion del tipo vive en la
// base: nada de esto se puede comprobar con una base simulada, que es
// exactamente por lo que estas pruebas estan aqui y no en `tests/api`.

async function setup() {
  const member = await createWorkspaceMember({ role: "admin" });
  const fixture = await createProjectFixture({
    workspaceId: member.workspace.id,
  });

  return { workspaceId: member.workspace.id, projectId: fixture.project.id };
}

function definition(overrides: Record<string, unknown>) {
  return {
    key: `campo_${randomUUID().slice(0, 8)}`,
    name: "Campo",
    type: "text",
    ...overrides,
  };
}

// Drizzle envuelve el error de Postgres en uno cuyo mensaje es la consulta
// entera, asi que el nombre de la restriccion no esta en `message` sino en el
// `constraint` del error original. Comprobarlo ahi es ademas mas preciso que
// buscar el nombre en un texto que incluye toda la SQL.
async function expectConstraintViolation(
  operation: Promise<unknown>,
  constraint: string,
) {
  try {
    await operation;
  } catch (error) {
    const cause = (error as { cause?: { constraint?: string } }).cause;
    expect(cause?.constraint).toBe(constraint);
    return;
  }

  throw new Error(`Expected ${constraint} to reject the statement`);
}

describe("field_definition schema", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("rejects a type outside the vocabulary", async () => {
    const { workspaceId } = await setup();

    await expectConstraintViolation(
      db
        .insert(schema.fieldDefinitionTable)
        .values(definition({ workspaceId, type: "telepatia" })),
      "field_definition_type_valid",
    );
  });

  it("accepts every type in the vocabulary", async () => {
    const { workspaceId } = await setup();

    const types = [
      "text",
      "number",
      "currency",
      "select",
      "multi_select",
      "date",
      "checkbox",
      "user",
      "url",
      "relation",
    ];

    for (const type of types) {
      await db
        .insert(schema.fieldDefinitionTable)
        .values(definition({ workspaceId, type }));
    }

    const rows = await db.query.fieldDefinitionTable.findMany({
      where: eq(schema.fieldDefinitionTable.workspaceId, workspaceId),
    });

    expect(rows).toHaveLength(types.length);
  });

  // El motivo de que las claves unicas sean parciales: un
  // `unique(workspace_id, project_id, key)` dejaria pasar este caso, porque en
  // SQL dos NULL no son iguales entre si.
  it("rejects a duplicate key among workspace-scoped definitions", async () => {
    const { workspaceId } = await setup();

    await db
      .insert(schema.fieldDefinitionTable)
      .values(definition({ workspaceId, key: "presupuesto" }));

    await expectConstraintViolation(
      db
        .insert(schema.fieldDefinitionTable)
        .values(definition({ workspaceId, key: "presupuesto" })),
      "field_definition_workspace_key_unique",
    );
  });

  it("rejects a duplicate key within the same project", async () => {
    const { workspaceId, projectId } = await setup();

    await db
      .insert(schema.fieldDefinitionTable)
      .values(definition({ workspaceId, projectId, key: "presupuesto" }));

    await expectConstraintViolation(
      db
        .insert(schema.fieldDefinitionTable)
        .values(definition({ workspaceId, projectId, key: "presupuesto" })),
      "field_definition_project_key_unique",
    );
  });

  // Los dos alcances no se pisan: el campo de proyecto y el de espacio pueden
  // llamarse igual. Cual gana al resolverlos es cosa del controlador, no de
  // la base.
  it("allows the same key in a project and in the workspace", async () => {
    const { workspaceId, projectId } = await setup();

    await db
      .insert(schema.fieldDefinitionTable)
      .values(definition({ workspaceId, key: "presupuesto" }));

    await db
      .insert(schema.fieldDefinitionTable)
      .values(definition({ workspaceId, projectId, key: "presupuesto" }));

    const rows = await db.query.fieldDefinitionTable.findMany({
      where: eq(schema.fieldDefinitionTable.workspaceId, workspaceId),
    });

    expect(rows).toHaveLength(2);
  });

  it("allows the same key in two different projects", async () => {
    const { workspaceId, projectId } = await setup();
    const other = await createProjectFixture({ workspaceId });

    await db
      .insert(schema.fieldDefinitionTable)
      .values(definition({ workspaceId, projectId, key: "presupuesto" }));

    await db.insert(schema.fieldDefinitionTable).values(
      definition({
        workspaceId,
        projectId: other.project.id,
        key: "presupuesto",
      }),
    );

    const rows = await db.query.fieldDefinitionTable.findMany({
      where: eq(schema.fieldDefinitionTable.workspaceId, workspaceId),
    });

    expect(rows).toHaveLength(2);
  });

  it("drops a project's definitions with the project, keeping workspace ones", async () => {
    const { workspaceId, projectId } = await setup();

    await db
      .insert(schema.fieldDefinitionTable)
      .values(definition({ workspaceId, key: "del_espacio" }));
    await db
      .insert(schema.fieldDefinitionTable)
      .values(definition({ workspaceId, projectId, key: "del_proyecto" }));

    await db
      .delete(schema.projectTable)
      .where(eq(schema.projectTable.id, projectId));

    const rows = await db.query.fieldDefinitionTable.findMany({
      where: eq(schema.fieldDefinitionTable.workspaceId, workspaceId),
    });

    expect(rows.map((row) => row.key)).toEqual(["del_espacio"]);
  });
});

describe("task.custom_fields", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  async function insertTask(projectId: string, values = {}) {
    const [task] = await db
      .insert(schema.taskTable)
      .values({
        ...taskTreeValues(),
        projectId,
        title: "Tarea",
        status: "to-do",
        priority: "medium",
        number: 1,
        ...values,
      })
      .returning();

    if (!task) throw new Error("Failed to seed task");
    return task;
  }

  // Lo que hace que la columna sea segura de leer: nunca es null, asi que
  // nadie tiene que defenderse de un `undefined` antes de mirar dentro.
  it("defaults to an empty object rather than null", async () => {
    const { projectId } = await setup();
    const task = await insertTask(projectId);

    expect(task.customFields).toEqual({});
  });

  it("round-trips values of every shape a field can hold", async () => {
    const { projectId } = await setup();

    const values = {
      presupuesto: 1250.5,
      cliente: "BAUHAUS TORREVIEJA",
      urgente: true,
      etiquetas: ["obra", "carpa"],
      revisado_el: "2026-08-27",
      vacio: null,
    };

    const task = await insertTask(projectId, { customFields: values });
    const stored = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, task.id),
    });

    expect(stored?.customFields).toEqual(values);
  });

  // El GIN existe para esto. La prueba no demuestra que el plan lo use —eso es
  // `EXPLAIN` y llega en la Fase 4—, solo que el operador de contencion sobre
  // el que se construye todo devuelve lo que debe.
  it("finds tasks by containment, which is what the GIN index serves", async () => {
    const { projectId } = await setup();

    await insertTask(projectId, {
      customFields: { cliente: "BAUHAUS", presupuesto: 1000 },
    });
    await insertTask(projectId, {
      number: 2,
      customFields: { cliente: "LEROY", presupuesto: 2000 },
    });

    const matches = await db
      .select({ id: schema.taskTable.id })
      .from(schema.taskTable)
      .where(
        sql`${schema.taskTable.customFields} @> '{"cliente": "BAUHAUS"}'::jsonb`,
      );

    expect(matches).toHaveLength(1);
  });
});
