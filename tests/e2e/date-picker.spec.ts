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
  await page
    .getByRole("button", { name: "Sin fecha" })
    .first()
    .click({ timeout: 30_000 });

  const month = new Intl.DateTimeFormat("es-ES", { month: "long" }).format(
    new Date(),
  );
  await expect(page.getByRole("grid").first()).toHaveAccessibleName(
    new RegExp(month, "i"),
  );
});
