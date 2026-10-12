import { API_URL, expect, test } from "./fixtures";

/**
 * Sesiones activas (ADR 079): ver dónde está abierta la cuenta y cerrar el
 * resto desde Ajustes › Seguridad.
 */
test("cerrar las demás sesiones desde Seguridad", async ({
  page,
  riuna,
  browser,
  baseURL,
}) => {
  // Otra sesión de la misma cuenta, en otro navegador.
  const origin = baseURL ?? "http://localhost:5174";
  const other = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  });
  const signIn = await other.request.post(`${API_URL}/api/auth/sign-in/email`, {
    headers: { "content-type": "application/json", Origin: origin },
    data: { email: riuna.email, password: "E2e-passw0rd!" },
  });
  expect(signIn.ok()).toBe(true);

  await page.goto("/dashboard/settings/account/security");
  const rows = page.getByTestId("session-row");
  await expect(rows).toHaveCount(2, { timeout: 30_000 });
  await expect(rows.first()).toContainText("Esta sesión");
  await expect(page.getByText("Safari en iOS")).toBeVisible();

  await page.getByRole("button", { name: "Cerrar todas menos esta" }).click();
  await expect(page.getByText("Sesiones cerradas: 1")).toBeVisible();
  await expect(rows).toHaveCount(1);

  // La sesión cerrada ya no existe en la base: al caducar su caché, sale.
  const sessions = await riuna.api<Array<{ id: string }>>(
    "get",
    "/api/session",
  );
  expect(sessions).toHaveLength(1);
  await other.close();
});
