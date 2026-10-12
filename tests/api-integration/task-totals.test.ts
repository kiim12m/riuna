import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  childTreeValues,
  createProjectFixture,
  createWorkspaceMember,
  taskTreeValues,
} from "./helpers/fixtures";

type Totals = {
  count: number;
  estimateSeconds: number;
  loggedSeconds: number;
  fields: Record<string, number>;
};

const HOUR = 3600;

let number = 0;

async function setup() {
  const ana = await createWorkspaceMember({ userName: "Ana" });
  const { project } = await createProjectFixture({
    workspaceId: ana.workspace.id,
  });
  await db.insert(schema.fieldDefinitionTable).values({
    workspaceId: ana.workspace.id,
    projectId: project.id,
    key: "presupuesto",
    name: "Presupuesto",
    type: "currency",
    config: { currency: "EUR" },
  });
  mockAuthenticatedSession(ana.user);
  return { ana, project, app: createApp().app };
}

async function seed(
  projectId: string,
  values: {
    title: string;
    priority?: string;
    estimate?: number | null;
    presupuesto?: unknown;
    parent?: { id: string; path: string; depth: number };
  },
) {
  number += 1;
  const tree = values.parent
    ? childTreeValues(values.parent)
    : taskTreeValues();
  const [row] = await db
    .insert(schema.taskTable)
    .values({
      ...tree,
      projectId,
      title: values.title,
      status: "to-do",
      priority: values.priority ?? "medium",
      number,
      estimate: values.estimate ?? null,
      customFields:
        values.presupuesto === undefined
          ? {}
          : { presupuesto: values.presupuesto },
    })
    .returning();
  if (!row) throw new Error("Failed to seed task");
  return row;
}

async function log(taskId: string, userId: string, seconds: number) {
  await db.insert(schema.timeEntryTable).values({
    taskId,
    userId,
    startTime: new Date(),
    endTime: new Date(),
    duration: seconds,
  });
}

describe("API integration: table totals (ADR 080)", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("adds up each matching task once: estimate, logged time and money", async () => {
    const { ana, project, app } = await setup();
    const parent = await seed(project.id, {
      title: "Instalación",
      priority: "high",
      estimate: 4 * HOUR,
      presupuesto: 1000,
    });
    const child = await seed(project.id, {
      title: "Cableado",
      priority: "high",
      estimate: 2 * HOUR,
      presupuesto: 250.5,
      parent,
    });
    const other = await seed(project.id, {
      title: "Pintura",
      priority: "low",
      estimate: 8 * HOUR,
      presupuesto: 99,
    });
    // Un valor viejo que no es numero no suma ni rompe la consulta.
    await seed(project.id, {
      title: "Texto",
      priority: "high",
      presupuesto: "mil",
    });
    await log(parent.id, ana.user.id, HOUR);
    await log(child.id, ana.user.id, 30 * 60);
    await log(other.id, ana.user.id, 5 * HOUR);

    const all = (await (
      await app.request(`/api/task/tasks/${project.id}/totals`)
    ).json()) as Totals;
    expect(all).toEqual({
      count: 4,
      estimateSeconds: 14 * HOUR,
      loggedSeconds: 6.5 * HOUR,
      fields: { presupuesto: 1349.5 },
    });

    const filter = JSON.stringify({
      type: "condition",
      field: "priority",
      operator: "eq",
      value: "high",
    });
    const high = (await (
      await app.request(
        `/api/task/tasks/${project.id}/totals?filter=${encodeURIComponent(filter)}`,
      )
    ).json()) as Totals;
    expect(high).toEqual({
      count: 3,
      estimateSeconds: 6 * HOUR,
      loggedSeconds: 1.5 * HOUR,
      fields: { presupuesto: 1250.5 },
    });

    const roots = (await (
      await app.request(
        `/api/task/tasks/${project.id}/totals?filter=${encodeURIComponent(filter)}&treeScope=roots`,
      )
    ).json()) as Totals;
    expect(roots.count).toBe(2);
    expect(roots.estimateSeconds).toBe(4 * HOUR);
  });

  it("answers 400 to a filter that does not compile", async () => {
    const { project, app } = await setup();
    const filter = JSON.stringify({
      type: "condition",
      field: "custom.no_existe",
      operator: "eq",
      value: 1,
    });
    const response = await app.request(
      `/api/task/tasks/${project.id}/totals?filter=${encodeURIComponent(filter)}`,
    );
    expect(response.status).toBe(400);
  });
});
