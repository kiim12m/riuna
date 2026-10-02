import { createTask, expect, test } from "./fixtures";

function keyOf(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** El ultimo dia laborable antes de hoy, con la jornada por defecto. */
function previousWorkDay() {
  const date = new Date();
  do {
    date.setDate(date.getDate() - 1);
  } while (date.getDay() === 0 || date.getDay() === 6);
  return keyOf(date);
}

/**
 * El stand-up (sub-bloque 2.4 del interludio de productividad): se abre
 * desde Hoy, sale del plan y del ultimo cierre, y se copia en Markdown.
 */
test.describe("Stand-up", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] });

  test("enseña ayer, hoy y bloqueos, y lo copia en Markdown", async ({
    page,
    riuna,
  }) => {
    const key = await createTask(riuna, "Pedir material");
    await riuna.api("put", `/api/task/assignee/${key}`, {
      userId: riuna.userId,
    });
    await riuna.api(
      "put",
      `/api/planner/${key}?workspaceId=${riuna.workspaceId}`,
      { plannedDate: keyOf(new Date()) },
    );
    await riuna.api(
      "put",
      `/api/planner/${key}/key?workspaceId=${riuna.workspaceId}`,
      { key: true },
    );
    await riuna.api(
      "put",
      `/api/review/day/${previousWorkDay()}?workspaceId=${riuna.workspaceId}`,
      {
        decisions: [],
        blockers: "Esperando al proveedor",
        note: "Esto no sale",
      },
    );

    await page.goto(`/dashboard/workspace/${riuna.workspaceId}/today`);
    await page
      .getByRole("button", { name: "Stand-up" })
      .click({ timeout: 30_000 });

    const markdown = page.getByTestId("standup-markdown");
    await expect(markdown).toContainText("★ Pedir material");
    await expect(markdown).toContainText("- Esperando al proveedor");
    await expect(markdown).toContainText("- Nada terminado");
    await expect(markdown).not.toContainText("Esto no sale");

    await page.getByRole("button", { name: "Copiar en Markdown" }).click();
    await expect(page.getByText("Stand-up copiado")).toBeVisible();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain("**Hoy**");
    expect(copied).toContain("★ Pedir material");
  });
});
