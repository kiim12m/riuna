import { expect, test } from "./fixtures";

type Column = { id: string; name: string };
type Rule = { id: string; eventType: string; columnId: string };

/**
 * Las reglas de GitHub y Gitea (Fase 8, Bloque 0): el editor no dejaba
 * quitar una regla —el hook existia sin consumidor— ni ofrecia «issue
 * reabierto», que la API ya resolvia.
 */
test.describe("Reglas de flujo de trabajo", () => {
  test("una regla vuelve a «Por defecto» y se borra", async ({
    page,
    riuna,
  }) => {
    const columns = await riuna.api<Column[]>(
      "get",
      `/api/column/${riuna.projectId}`,
    );
    const target = columns.at(-1);
    if (!target) throw new Error("The project has no columns");

    await riuna.api("put", `/api/workflow-rule/${riuna.projectId}`, {
      integrationType: "github",
      eventType: "pr_opened",
      columnId: target.id,
    });
    const rules = () =>
      riuna.api<Rule[]>("get", `/api/workflow-rule/${riuna.projectId}`);

    await page.goto(
      `/dashboard/workspace/${riuna.workspaceId}/admin/project-settings/${riuna.projectId}/workflow`,
    );
    const row = page.getByTestId("workflow-rule-github-pr_opened");
    await expect(row.getByRole("combobox")).toContainText(target.name, {
      timeout: 30_000,
    });
    await expect(
      page.getByTestId("workflow-rule-github-issue_reopened"),
    ).toContainText("Issue reabierto");

    await row.getByRole("combobox").click();
    await page.getByRole("option", { name: "Por defecto" }).click();

    await expect(row.getByRole("combobox")).toContainText("Por defecto");
    await expect.poll(async () => (await rules()).length).toBe(0);
  });
});
