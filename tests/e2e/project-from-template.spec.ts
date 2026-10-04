import { createTask, expect, test } from "./fixtures";

/**
 * Un proyecto entero desde una plantilla de proyecto: aplicarla a un proyecto
 * existente solo desplegaba el arbol; ahora el proyecto nace con sus columnas,
 * sus epicas y sus tareas.
 */
test("crea un proyecto desde una plantilla de proyecto", async ({
  page,
  riuna,
}) => {
  await createTask(riuna, "Replanteo del solar");
  await riuna.api("post", `/api/template/from-project/${riuna.projectId}`, {
    name: "Obra tipo",
  });

  await page.goto(`/dashboard/workspace/${riuna.workspaceId}/today`);
  await page
    .getByRole("button", { name: "Añadir proyecto" })
    .click({ timeout: 30_000 });
  await page
    .getByPlaceholder("Nombre del proyecto")
    .fill("Obra de la calle Sol");

  await page.getByLabel("Plantilla").click();
  await page.getByRole("option", { name: "Obra tipo" }).click();
  await page.getByRole("button", { name: "Crear proyecto" }).click();

  await expect(page).toHaveURL(/\/project\/[^/]+\/board/, { timeout: 30_000 });
  await expect(page.getByText("Replanteo del solar")).toBeVisible({
    timeout: 30_000,
  });
});
