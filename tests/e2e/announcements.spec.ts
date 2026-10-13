import { expect, test } from "./fixtures";

/**
 * Avisos del proyecto (ADR 081): publicar uno fijado, verlo como franja en
 * las vistas del proyecto y ocultarlo para mí.
 */
test("publicar un aviso fijado y verlo como franja", async ({
  page,
  riuna,
}) => {
  await page.goto(
    `/dashboard/workspace/${riuna.workspaceId}/project/${riuna.projectId}/announcements`,
  );
  await page.getByTestId("announcement-new").click({ timeout: 30_000 });
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Título").fill("Corte de luz el jueves");
  await dialog.getByRole("switch").first().click();
  await dialog.getByTestId("announcement-save").click();

  await expect(page.getByText("Aviso publicado")).toBeVisible();
  const card = page
    .getByTestId("announcement-card")
    .filter({ hasText: "Corte de luz el jueves" });
  await expect(card).toBeVisible();
  await expect(card).toContainText("Fijado");

  await page.goto(
    `/dashboard/workspace/${riuna.workspaceId}/project/${riuna.projectId}/board`,
  );
  const banner = page.getByTestId("pinned-announcement");
  await expect(banner).toContainText("Corte de luz el jueves", {
    timeout: 30_000,
  });
  await banner.getByRole("button", { name: "Ocultar para mí" }).click();
  await expect(banner).toHaveCount(0);

  // Ocultarla es de este navegador: el aviso sigue en el tablón.
  await page.reload();
  await expect(page.getByTestId("pinned-announcement")).toHaveCount(0);
  await page.getByTestId("project-announcements-link").click();
  await expect(card).toBeVisible();
});
