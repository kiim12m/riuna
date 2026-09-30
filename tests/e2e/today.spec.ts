import { createTask, expect, test } from "./fixtures";

/** `yyyy-mm-dd` en hora local, para `PUT /planner/:taskId`. */
function serverDay(offsetDays: number) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * "Hoy": la pantalla de entrada del espacio (ADR 047). Compone el plan
 * personal del Planificador -"De dias anteriores", "Plan de hoy"- con lo
 * urgente sin planificar y lo hecho, y ofrece la casilla de marcar como
 * hecha directamente en la fila.
 */
test.describe("Hoy", () => {
  test("reparte el plan, lo de dias anteriores y lo urgente, y 'Añadir a hoy'/'Planificar hoy' las mete en el plan", async ({
    page,
    riuna,
  }) => {
    const dia = (n: number) =>
      new Date(Date.now() + n * 86_400_000).toISOString();

    const overdueId = await createTask(riuna, "Revisar factura", {
      dueDate: dia(-3),
    });
    const dueTodayId = await createTask(riuna, "Enviar informe", {
      dueDate: dia(0),
    });
    const previousId = await createTask(riuna, "Llamar al proveedor");

    for (const id of [overdueId, dueTodayId, previousId]) {
      await riuna.api("put", `/api/task/assignee/${id}`, {
        userId: riuna.userId,
      });
    }

    // Planificada ayer y sin terminar: "De dias anteriores".
    await riuna.api(
      "put",
      `/api/planner/${previousId}?workspaceId=${riuna.workspaceId}`,
      { plannedDate: serverDay(-1) },
    );

    await page.goto(`/dashboard/workspace/${riuna.workspaceId}/today`);

    await expect(
      page.getByRole("button", { name: /De días anteriores/ }),
    ).toBeVisible({ timeout: 30_000 });
    const previousRow = page.locator(`[data-testid="today-row-${previousId}"]`);
    await expect(previousRow).toBeVisible();

    await expect(
      page.getByRole("heading", {
        name: "Vence hoy o vencida, sin planificar",
      }),
    ).toBeVisible();
    const overdueRow = page.locator(`[data-testid="today-row-${overdueId}"]`);
    const dueTodayRow = page.locator(`[data-testid="today-row-${dueTodayId}"]`);
    await expect(overdueRow.getByText("Vencida")).toBeVisible();
    await expect(dueTodayRow.getByText("Vence hoy")).toBeVisible();

    // "Añadir a hoy" mete lo de dias anteriores en el plan de hoy.
    await previousRow.getByRole("button", { name: "Añadir a hoy" }).click();

    // "Planificar hoy" hace lo mismo con lo urgente.
    await overdueRow.getByRole("button", { name: "Planificar hoy" }).click();

    const plannedSection = page.locator("section", {
      has: page.getByRole("heading", { name: "Plan de hoy" }),
    });
    await expect(
      plannedSection.locator(`[data-testid="today-row-${previousId}"]`),
    ).toBeVisible();
    await expect(
      plannedSection.locator(`[data-testid="today-row-${overdueId}"]`),
    ).toBeVisible();
  });

  test("marcar la casilla mueve la tarea a 'Hechas hoy'", async ({
    page,
    riuna,
  }) => {
    const taskId = await createTask(riuna, "Acta de replanteo");
    await riuna.api("put", `/api/task/assignee/${taskId}`, {
      userId: riuna.userId,
    });
    await riuna.api(
      "put",
      `/api/planner/${taskId}?workspaceId=${riuna.workspaceId}`,
      { plannedDate: serverDay(0) },
    );

    await page.goto(`/dashboard/workspace/${riuna.workspaceId}/today`);

    const row = page.locator(`[data-testid="today-row-${taskId}"]`);
    await expect(row).toBeVisible();
    await row
      .getByRole("checkbox", { name: "Marcar tarea como hecha" })
      .click();

    const plannedSection = page.locator("section", {
      has: page.getByRole("heading", { name: "Plan de hoy" }),
    });
    await expect(
      plannedSection.locator(`[data-testid="today-row-${taskId}"]`),
    ).toHaveCount(0);

    await page.getByRole("button", { name: /Hechas hoy/ }).click();
    await expect(
      page.locator(`[data-testid="today-row-${taskId}"]`),
    ).toBeVisible();
  });

  test("sin tareas asignadas se ve el estado vacio", async ({
    page,
    riuna,
  }) => {
    await page.goto(`/dashboard/workspace/${riuna.workspaceId}/today`);

    await expect(page.getByText("Nada pendiente")).toBeVisible();
  });
});
