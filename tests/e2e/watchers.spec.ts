import { createTask, expect, test } from "./fixtures";

/**
 * Observadores (ADR 076): quien crea una tarea la observa, puede dejar de
 * observarla desde el detalle, y lo que observa sin tenerlo asignado sale en
 * «Mis tareas › Observando».
 */
test("observar una tarea desde su detalle y encontrarla en «Observando»", async ({
  page,
  riuna,
}) => {
  const taskId = await createTask(riuna, "Revisar acometida");

  await page.goto(
    `/dashboard/workspace/${riuna.workspaceId}/project/${riuna.projectId}/board?taskId=${taskId}`,
  );

  // El lateral monta a la vez su disposicion movil y la de escritorio, una
  // oculta por CSS: la que cuenta es la visible.
  const button = page
    .getByTestId("task-watchers-button")
    .filter({ visible: true });
  await expect(button).toHaveText(/Observando\s*1/, { timeout: 30_000 });

  await button.click();
  await expect(page.getByText("Observan esta tarea")).toBeVisible();
  await expect(page.getByText("(tú)")).toBeVisible();

  await page.getByTestId("task-watchers-toggle").click();
  await expect(button).toHaveText(/Observar\s*0/);
  await expect(
    page.getByText("Nadie observa esta tarea todavía."),
  ).toBeVisible();

  await page.getByTestId("task-watchers-toggle").click();
  await expect(button).toHaveText(/Observando\s*1/);

  await page.goto(
    `/dashboard/workspace/${riuna.workspaceId}/my-tasks/watching`,
  );
  const list = page.getByTestId("watching-list");
  await expect(list.getByText("Revisar acometida")).toBeVisible({
    timeout: 30_000,
  });
  await expect(list.getByText("Sin asignar")).toBeVisible();
});
