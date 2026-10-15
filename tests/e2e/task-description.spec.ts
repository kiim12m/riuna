import { createTask, expect, test } from "./fixtures";

/**
 * La descripcion guarda sola al escribir y lo guardado vuelve al recargar. Es
 * la red del editor reutilizable (ADR 092), que la wiki comparte.
 */
test("la descripción de una tarea se guarda al escribir", async ({
  page,
  riuna,
}) => {
  const taskId = await createTask(riuna, "Revisar la acometida");
  await page.goto(
    `/dashboard/workspace/${riuna.workspaceId}/project/${riuna.projectId}/task/${taskId}`,
  );

  const editor = page.locator(".riuna-tiptap-prose").first();
  await expect(editor).toBeVisible({ timeout: 30_000 });
  await editor.click();
  await page.keyboard.type("Medir la tensión en la salida del cuadro.");

  await expect
    .poll(
      async () =>
        (await riuna.api<{ description: string }>("get", `/api/task/${taskId}`))
          .description,
      { timeout: 10_000 },
    )
    .toContain("Medir la tensión en la salida del cuadro.");

  await page.reload();
  await expect(
    page.getByText("Medir la tensión en la salida del cuadro.").first(),
  ).toBeVisible({ timeout: 30_000 });
});
