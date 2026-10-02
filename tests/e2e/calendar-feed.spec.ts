import { createTask, expect, test } from "./fixtures";

function keyOf(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * El enlace del calendario (sub-bloque 4.1 del interludio de productividad,
 * ADR 057): se crea en Ajustes › Preferencias, se enseña una vez, sirve el
 * plan con hora sin sesion y deja de servir al revocarlo.
 */
test.describe("Enlace del calendario", () => {
  test("crea el enlace, sirve el plan con hora y deja de servir al revocarlo", async ({
    page,
    riuna,
    playwright,
  }) => {
    const taskId = await createTask(riuna, "Llamar al proveedor");
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    await riuna.api(
      "put",
      `/api/planner/${taskId}?workspaceId=${riuna.workspaceId}`,
      { plannedDate: keyOf(tomorrow), startMinute: 10 * 60 },
    );

    await page.goto(`/dashboard/workspace/${riuna.workspaceId}/today`);
    await page.getByRole("button", { name: "Bandeja" }).waitFor({
      timeout: 30_000,
    });
    await page.goto("/dashboard/settings/account/preferences");
    const section = page.getByTestId("calendar-feed-section");
    await expect(section).toContainText("Aún no hay enlace del calendario.", {
      timeout: 30_000,
    });

    await section.getByRole("button", { name: "Crear enlace" }).click();
    const shown = page.getByTestId("calendar-feed-url");
    await expect(shown).toContainText("/api/calendar/");
    await expect(section).toContainText("Enlace activo desde el");
    const url = (await shown.locator("code").textContent()) ?? "";
    expect(url).toMatch(
      /^https?:\/\/.+\/api\/calendar\/[A-Za-z0-9_-]{43}\.ics$/,
    );

    // Sin sesion: un contexto de peticiones nuevo, sin las cookies del
    // navegador. El token es la credencial.
    const anonymous = await playwright.request.newContext();
    const feed = await anonymous.get(url);
    expect(feed.status()).toBe(200);
    const body = await feed.text();
    expect(body).toContain("BEGIN:VCALENDAR");
    expect(body).toContain("SUMMARY:Llamar al proveedor");

    await section.getByRole("button", { name: "Revocar" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Revocar" })
      .click();
    await expect(section).toContainText("Aún no hay enlace del calendario.");
    await expect(shown).toBeHidden();
    expect((await anonymous.get(url)).status()).toBe(404);
    await anonymous.dispose();
  });
});
