import { expect, test } from "./fixtures";

/**
 * Pantallas heredadas que tenian el texto en ingles escrito a mano: la
 * autorizacion de clientes MCP y la conexion de dispositivos. La interfaz es
 * en español, y el aviso de `hardcoded-copy.test.ts` impide que vuelva.
 */
test.describe("Pantallas de autorización en español", () => {
  test("conectar un dispositivo pide el código en español", async ({
    page,
    riuna: _riuna,
  }) => {
    await page.goto("/device");

    await expect(
      page.getByText("Conectar un dispositivo", { exact: true }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByPlaceholder("p. ej. ABCD-1234")).toBeVisible();

    await page.getByRole("button", { name: "Continuar" }).click();
    await expect(
      page.getByText("Introduce el código que muestra tu dispositivo."),
    ).toBeVisible();
  });

  test("aprobar un dispositivo con un código ofrece aprobar y rechazar", async ({
    page,
    riuna: _riuna,
  }) => {
    await page.goto("/device/approve?user_code=ABCD1234");

    await expect(page.getByRole("button", { name: "Aprobar" })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole("button", { name: "Rechazar" })).toBeVisible();
    await expect(page.getByText("ABCD1234")).toBeVisible();
  });

  test("una solicitud MCP inválida se explica en español", async ({
    page,
    riuna: _riuna,
  }) => {
    await page.goto("/mcp/authorize");

    await expect(page.getByText("Autorización fallida")).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByText("Vuelve a tu cliente MCP e inicia la conexión de nuevo."),
    ).toBeVisible();
  });
});
