import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { settleEvents, subscribeToEvent } from "../../apps/api/src/events";
import { createApp } from "../../apps/api/src/index";
import { generateRecurringTasks } from "../../apps/api/src/recurrence/generate";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

// Auditoria 1.9: la plantilla de proyecto compensaba borrando el proyecto
// cuando las tareas ya habian confirmado y avisado, y la recurrencia hacia
// tres confirmaciones seguidas. Un fallo a mitad dejaba avisos de tareas que
// ya no existian, o una tarea a medias y la recurrencia avanzada.
//
// El fallo se provoca con lo unico que solo la base detecta: dos etiquetas
// con el mismo nombre en la misma tarea (`label_task_name_unique`).
const DUPLICATED_LABELS = [
  { name: "Obra", color: "#111111" },
  { name: "Obra", color: "#222222" },
];

const created: string[] = [];
let subscribed = false;

beforeEach(async () => {
  await resetTestDatabase();
  created.length = 0;
  if (!subscribed) {
    subscribed = true;
    subscribeToEvent<{ title: string }>("task.created", async (data) => {
      created.push(data.title);
    });
  }
});

describe("project from a template (auditoria 1.9)", () => {
  it("leaves nothing behind, and tells no one, when a task fails half way", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const [template] = await db
      .insert(schema.templateTable)
      .values({
        workspaceId: member.workspace.id,
        createdBy: member.user.id,
        name: "Obra rota",
        kind: "project",
        content: {
          tasks: [
            { title: "Replanteo" },
            { title: "Acopio", labels: DUPLICATED_LABELS },
          ],
        },
      })
      .returning();
    if (!template) throw new Error("seed");

    mockAuthenticatedSession(member.user);
    const response = await createApp().app.request("/api/project", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Obra a medias",
        workspaceId: member.workspace.id,
        icon: "Folder",
        slug: "MED",
        templateId: template.id,
      }),
    });
    await settleEvents();

    expect(response.ok).toBe(false);
    const projects = await db
      .select()
      .from(schema.projectTable)
      .where(eq(schema.projectTable.name, "Obra a medias"));
    expect(projects).toEqual([]);
    expect(created).toEqual([]);
  });
});

describe("recurring tasks (auditoria 1.9)", () => {
  it("creates nothing and does not advance when the task fails half way", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const nextRunAt = new Date(Date.now() - 86_400_000);
    const [recurrence] = await db
      .insert(schema.taskRecurrenceTable)
      .values({
        projectId: project.id,
        createdBy: member.user.id,
        template: { title: "Parte", labels: DUPLICATED_LABELS },
        cadence: { frequency: "daily", interval: 1 },
        nextRunAt,
        active: true,
      })
      .returning();
    if (!recurrence) throw new Error("seed");

    const outcome = await generateRecurringTasks();
    await settleEvents();

    expect(outcome.degraded).toBe(true);
    const tasks = await db
      .select()
      .from(schema.taskTable)
      .where(eq(schema.taskTable.projectId, project.id));
    expect(tasks).toEqual([]);
    expect(created).toEqual([]);
    const [after] = await db
      .select({ nextRunAt: schema.taskRecurrenceTable.nextRunAt })
      .from(schema.taskRecurrenceTable)
      .where(eq(schema.taskRecurrenceTable.id, recurrence.id));
    expect(after?.nextRunAt.getTime()).toBe(nextRunAt.getTime());
  });
});
