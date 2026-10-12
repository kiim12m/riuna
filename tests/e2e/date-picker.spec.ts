import { createTask, expect, test } from "./fixtures";

/**
 * El selector de fecha pintaba los dias y el titulo del mes en ingles aunque
 * la interfaz estuviera en espanol: `DayPicker` no recibia `locale`. Ninguna
 * prueba lo veia porque todas miran el valor elegido, no el rotulo.
 */
test("el selector de fecha habla castellano", async ({ page, riuna }) => {
  const taskId = await createTask(riuna, "Revisar acometida");

  await page.goto(
    `/dashboard/workspace/${riuna.workspaceId}/project/${riuna.projectId}/task/${taskId}`,
  );
  await expect(
    page.getByRole("textbox", { name: "Revisar acometida" }),
  ).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "Sin fecha" }).first().click();
  const grid = page.getByRole("grid").first();
  await expect(grid).toBeVisible();

  const month = new Intl.DateTimeFormat("es-ES", { month: "long" }).format(
    new Date(),
  );
  await expect(grid).toHaveAccessibleName(new RegExp(month, "i"));
});
