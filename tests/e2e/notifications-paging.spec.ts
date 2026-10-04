import { expect, test } from "./fixtures";

/**
 * La campana traia las 50 mas recientes y contaba las no leidas entre ellas:
 * con mas, el numero mentia y las anteriores no se podian ver.
 */
test("la campana cuenta todas las no leídas y carga las anteriores", async ({
  page,
  riuna,
}) => {
  test.setTimeout(120_000);
  for (let index = 1; index <= 60; index++) {
    await riuna.api("post", "/api/notification", {
      title: `Aviso ${String(index).padStart(2, "0")}`,
      type: "info",
    });
  }

  await page.goto(`/dashboard/workspace/${riuna.workspaceId}/today`);
  const bell = page.getByRole("button", { name: /Notificaciones/ }).first();
  // 60 mas la de bienvenida al espacio que ya habia: el numero es el total del
  // servidor, no lo que cabe en la primera pagina.
  await expect(bell).toContainText("61", { timeout: 30_000 });

  await bell.click();
  const items = page.getByRole("menuitem").filter({ hasText: /^Aviso / });
  await expect(items).toHaveCount(50);

  await page
    .getByRole("menuitem", { name: "Cargar notificaciones anteriores" })
    .click();
  await expect(items).toHaveCount(60);
  // Ya no queda nada mas que cargar.
  await expect(
    page.getByRole("menuitem", { name: "Cargar notificaciones anteriores" }),
  ).toHaveCount(0);
});
