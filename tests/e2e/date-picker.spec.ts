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
  // Con la tarea ya cargada: con el build de produccion (el simulacro de
  // restauracion) el clic llegaba antes y el selector no se abria.
  await expect(
    page.getByRole("textbox", { name: "Revisar acometida" }),
  ).toBeVisible({
    timeout: 30_000,
  });
  const grid = page.getByRole("grid").first();
  await expect(async () => {
    if (!(await grid.isVisible())) {
      await page.getByRole("button", { name: "Sin fecha" }).first().click();
    }
    await expect(grid).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });

  const month = new Intl.DateTimeFormat("es-ES", { month: "long" }).format(
    new Date(),
  );
  await expect(grid).toHaveAccessibleName(new RegExp(month, "i"));
});
