import { createTask, expect, test } from "./fixtures";

/**
 * Subproyectos (ADR 089): un proyecto se cuelga de otro desde sus ajustes, la
 * Tabla del padre puede incluir las tareas del hijo con su clave, y la lista
 * de proyectos sale en arbol.
 */
test("un proyecto cuelga de otro y la Tabla del padre incluye sus tareas", async ({
  page,
  riuna,
}) => {
  const childSlug = `alc${Date.now().toString().slice(-4)}`;
  const child = await riuna.api<{ id: string }>("post", "/api/project", {
    name: "Reforma nave Alcalá",
    workspaceId: riuna.workspaceId,
    icon: "Folder",
    slug: childSlug,
  });
  await createTask(riuna, "Del padre");
  await riuna.api("post", `/api/task/${child.id}`, {
    title: "Cuadro general",
    description: "",
    status: "to-do",
    priority: "medium",
  });

  await page.goto(
    `/dashboard/workspace/${riuna.workspaceId}/admin/project-settings/${child.id}/general`,
  );
  await page.getByTestId("project-parent").click({ timeout: 30_000 });
  await page.getByRole("option", { name: "Proyecto E2E" }).click();
  await expect(page.getByText("Proyecto padre guardado")).toBeVisible();

  await page.goto(
    `/dashboard/workspace/${riuna.workspaceId}/project/${riuna.projectId}/table`,
  );
  await expect(page.getByText("Del padre")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Cuadro general")).toHaveCount(0);
  await page.getByTestId("include-subprojects").click();
  await expect(page).toHaveURL(/subprojects=true/);
  const row = page.getByRole("row").filter({ hasText: "Cuadro general" });
  await expect(row).toBeVisible();
  await expect(row).toContainText(childSlug);

  await page.goto(`/dashboard/workspace/${riuna.workspaceId}/admin/projects`);
  await expect(
    page.getByTestId("portfolio-table").getByText("1 subproyecto"),
  ).toBeVisible({ timeout: 30_000 });
});
