import { readFileSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

async function setup(role = "admin") {
  const member = await createWorkspaceMember({ role });
  const fixture = await createProjectFixture({
    workspaceId: member.workspace.id,
  });
  mockAuthenticatedSession(member.user);
  return { member, ...fixture, app: createApp().app };
}

function putRule(
  app: ReturnType<typeof createApp>["app"],
  projectId: string,
  columnId: string,
  eventType = "pr_opened",
) {
  return app.request(`/api/workflow-rule/${projectId}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ integrationType: "github", eventType, columnId }),
  });
}

function rulesOf(projectId: string) {
  return db
    .select()
    .from(schema.workflowRuleTable)
    .where(eq(schema.workflowRuleTable.projectId, projectId));
}

describe("API integration: workflow rules", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("saving the same event twice moves the one rule instead of adding another", async () => {
    const { project, columns, app } = await setup();

    expect((await putRule(app, project.id, columns.inReview.id)).status).toBe(
      200,
    );
    expect((await putRule(app, project.id, columns.done.id)).status).toBe(200);

    const rules = await rulesOf(project.id);
    expect(rules).toHaveLength(1);
    expect(rules[0]?.columnId).toBe(columns.done.id);
  });

  // Antes el guardado leia y luego escribia: dos a la vez dejaban dos filas y
  // `resolveTargetStatus` se quedaba con una cualquiera.
  it("concurrent saves of the same event leave a single rule", async () => {
    const { project, columns, app } = await setup();
    const order = [
      columns.todo.id,
      columns.inProgress.id,
      columns.inReview.id,
      columns.done.id,
    ];
    const targets = Array.from(
      { length: 20 },
      (_, index) => order[index % order.length] as string,
    );

    const responses = await Promise.all(
      targets.map((columnId) => putRule(app, project.id, columnId)),
    );

    expect(responses.map((response) => response.status)).toEqual(
      targets.map(() => 200),
    );
    expect(await rulesOf(project.id)).toHaveLength(1);
  });

  it("rejects a column from another project", async () => {
    const { member, project, app } = await setup();
    const other = await createProjectFixture({
      workspaceId: member.workspace.id,
    });

    const response = await putRule(app, project.id, other.columns.done.id);

    expect(response.status).toBe(400);
    expect(await rulesOf(project.id)).toHaveLength(0);
  });

  it("removing a rule leaves the event to the integration's default", async () => {
    const { project, columns, app } = await setup();
    const created = await putRule(app, project.id, columns.inReview.id);
    const rule = (await created.json()) as { id: string };

    const removed = await app.request(`/api/workflow-rule/${rule.id}`, {
      method: "DELETE",
    });

    expect(removed.status).toBe(200);
    expect(await rulesOf(project.id)).toHaveLength(0);
  });

  it("a member reads the rules but cannot change them", async () => {
    const { project, columns, app } = await setup("member");

    const listed = await app.request(`/api/workflow-rule/${project.id}`);
    expect(listed.status).toBe(200);

    const saved = await putRule(app, project.id, columns.done.id);
    expect(saved.status).toBe(403);
  });
});

// Ejecuta el SQL de la migracion, que es lo que llega a una instalacion con
// duplicados: la tabla no tenia unicidad desde que existe.
async function runWorkflowRuleUniqueMigration() {
  const file = new URL(
    "../../apps/api/drizzle/0081_workflow_rule_unique.sql",
    import.meta.url,
  );
  const statements = readFileSync(file, "utf8")
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await db.execute(sql.raw(statement));
  }
}

describe("migration 0081: one workflow rule per event", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("keeps the rule saved last and drops the older duplicates", async () => {
    const { workspace } = await createWorkspaceMember();
    const { project, columns } = await createProjectFixture({
      workspaceId: workspace.id,
    });

    await db.execute(
      sql.raw(
        'DROP INDEX IF EXISTS "workflow_rule_project_integration_event_unique"',
      ),
    );

    try {
      const rule = (columnId: string, updatedAt: string) => ({
        projectId: project.id,
        integrationType: "github",
        eventType: "pr_opened",
        columnId,
        updatedAt: new Date(updatedAt),
      });
      await db.insert(schema.workflowRuleTable).values([
        rule(columns.todo.id, "2026-01-01T10:00:00Z"),
        rule(columns.done.id, "2026-03-01T10:00:00Z"),
        rule(columns.inReview.id, "2026-02-01T10:00:00Z"),
        // Otro evento del mismo proyecto no se toca.
        {
          ...rule(columns.inProgress.id, "2026-01-01T10:00:00Z"),
          eventType: "pr_merged",
        },
      ]);

      await runWorkflowRuleUniqueMigration();
    } finally {
      await db.execute(
        sql.raw(
          'CREATE UNIQUE INDEX IF NOT EXISTS "workflow_rule_project_integration_event_unique" ON "workflow_rule" USING btree ("project_id","integration_type","event_type")',
        ),
      );
    }

    const rules = await rulesOf(project.id);
    expect(rules).toHaveLength(2);
    expect(rules.find((r) => r.eventType === "pr_opened")?.columnId).toBe(
      columns.done.id,
    );
    expect(rules.find((r) => r.eventType === "pr_merged")?.columnId).toBe(
      columns.inProgress.id,
    );
  });
});
