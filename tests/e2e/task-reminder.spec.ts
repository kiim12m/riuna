import { createTask, expect, test } from "./fixtures";

/**
 * Recordatorio en la tarea (ADR 077): ponerlo desde el detalle con un atajo,
 * verlo en el botón y quitarlo.
 */
test("pedir que me recuerde una tarea mañana y quitarlo", async ({
  page,
  riuna,
}) => {
  const taskId = await createTask(riuna, "Llamar a la distribuidora");

  await page.goto(
    `/dashboard/workspace/${riuna.workspaceId}/project/${riuna.projectId}/board?taskId=${taskId}`,
  );

  const button = page
    .getByTestId("task-reminder-button")
    .filter({ visible: true });
  await expect(button).toBeVisible({ timeout: 30_000 });
  await button.click();
  await page.getByLabel("Nota (opcional)").fill("Por el cuadro general");
  await page.getByTestId("task-reminder-preset-tomorrow").click();
  await expect(page.getByText(/Te lo recordará el/)).toBeVisible();

  const reminder = await riuna.api<{
    reminder: { remindAt: string; note: string | null } | null;
  }>("get", `/api/task-reminder/${taskId}`);
  expect(reminder.reminder?.note).toBe("Por el cuadro general");
  expect(new Date(reminder.reminder?.remindAt ?? 0).getHours()).toBe(9);

  await button.click();
  await expect(page.getByText(/Te lo recuerda el/)).toBeVisible();
  await expect(page.getByText("«Por el cuadro general»")).toBeVisible();
  await page.getByTestId("task-reminder-clear").click();
  await expect(page.getByText("Recordatorio quitado")).toBeVisible();

  await expect
    .poll(
      async () =>
        (
          await riuna.api<{ reminder: unknown }>(
            "get",
            `/api/task-reminder/${taskId}`,
          )
        ).reminder,
    )
    .toBeNull();
});
