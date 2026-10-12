import { createTask, expect, test } from "./fixtures";

/**
 * Revision de la Fase 9, hallazgo 12. Los desplegables del detalle devolvian
 * solo su boton mientras no se sabia si se podia editar, y saberlo pide el
 * espacio, el rol y 17 comprobaciones al servidor. Con el build de produccion
 * el primer clic llegaba antes y no abria nada: el humo lo tapaba con
 * reintentos.
 *
 * Aqui las comprobaciones tardan 2 s a proposito, y cada desplegable tiene que
 * abrirse antes de que lleguen.
 */
test("los desplegables del detalle se abren aunque los permisos tarden", async ({
  page,
  riuna,
}) => {
  const taskId = await createTask(riuna, "Medir la caseta");
  await page.route("**/api/auth/organization/has-permission", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    await route.continue();
  });

  await page.goto(
    `/dashboard/workspace/${riuna.workspaceId}/project/${riuna.projectId}/task/${taskId}`,
  );
  await expect(
    page.getByRole("textbox", { name: "Medir la caseta" }),
  ).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: "Sin fecha" }).first().click();
  await expect(page.getByRole("grid").first()).toBeVisible({ timeout: 1_500 });
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Por hacer" }).first().click();
  await expect(page.getByRole("button", { name: "En curso" })).toBeVisible({
    timeout: 1_500,
  });
});
