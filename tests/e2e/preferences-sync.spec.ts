import { expect, test } from "./fixtures";

/**
 * Las preferencias de presentacion viven en la cuenta y no solo en el
 * navegador: antes se perdian al cambiar de navegador, y de ahi salia que el
 * calendario empezara en domingo.
 */
test("una preferencia sobrevive a un navegador nuevo", async ({
  page,
  riuna,
}) => {
  await page.goto("/dashboard/settings/account/preferences");
  await page
    .getByRole("combobox")
    .filter({ hasText: "Domingo" })
    .click({ timeout: 30_000 });
  await page.getByRole("option", { name: "Lunes" }).click();

  // Sale al servidor, con una pequeña espera.
  await expect
    .poll(async () => {
      const reply = await riuna.api<{ preferences: { weekStartsOn?: number } }>(
        "get",
        "/api/user-preferences",
      );
      return reply.preferences.weekStartsOn;
    })
    .toBe(1);

  // Un navegador sin nada guardado: vacio el almacen local y recargo.
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await expect(
    page.getByRole("combobox").filter({ hasText: "Lunes" }),
  ).toBeVisible({ timeout: 30_000 });
});

test("lo que ya estaba personalizado en este navegador se sube la primera vez", async ({
  page,
  riuna,
}) => {
  await page.goto("/dashboard/settings/account/preferences");
  await page.getByRole("combobox").first().waitFor({ timeout: 30_000 });

  // Preferencias de antes de que existiera la sincronizacion, solo en local.
  await page.evaluate(() => {
    localStorage.setItem(
      "user-preferences",
      JSON.stringify({
        state: { weekStartsOn: 6, compactMode: true },
        version: 0,
      }),
    );
  });
  await page.reload();

  await expect
    .poll(async () => {
      const reply = await riuna.api<{
        preferences: { weekStartsOn?: number; compactMode?: boolean };
      }>("get", "/api/user-preferences");
      return reply.preferences;
    })
    .toMatchObject({ weekStartsOn: 6, compactMode: true });
});
