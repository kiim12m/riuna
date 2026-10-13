import { createTask, expect, test } from "./fixtures";
import { plusDays, upcomingMonday } from "./schedule-dates";

/**
 * Estado del proyecto (ADR 087): se cambia desde la lista de proyectos, la
 * lista lo resume y lo filtra, avisa si las tareas acaban después del fin, y
 * el cambio queda en el historial de sus ajustes.
 */
test("el estado de un proyecto se cambia en la lista y queda en su historial", async ({
  page,
  riuna,
}) => {
  const monday = upcomingMonday();
  await riuna.api("patch", `/api/project/${riuna.projectId}/status`, {
    endDate: monday.toISOString(),
  });
  await createTask(riuna, "Cuadro general", {
    dueDate: plusDays(monday, 2).toISOString(),
  });

  await page.goto(`/dashboard/workspace/${riuna.workspaceId}/admin/projects`);
  // Del lunes al miercoles: martes y miercoles, dos laborables de mas.
  await expect(page.getByTestId("project-overflow").first()).toBeVisible({
    timeout: 30_000,
  });

  await page.getByTestId("project-health").first().click();
  await page.getByRole("button", { name: "En riesgo", exact: true }).click();
  await page.getByLabel("Nota").fill("El cuadro llega tarde");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByTestId("project-health").first()).toHaveText(
    "En riesgo",
  );
  await expect(page.getByTestId("project-health-summary")).toContainText(
    "En riesgo1",
  );

  await page.getByRole("button", { name: "Los míos" }).click();
  await expect(page).toHaveURL(/show=mine/);
  await expect(page.getByTestId("project-health")).toHaveCount(0);
  await page.getByRole("button", { name: "En riesgo o desviados" }).click();
  await expect(page.getByTestId("project-health")).toHaveCount(1);

  await page.goto(
    `/dashboard/workspace/${riuna.workspaceId}/admin/project-settings/${riuna.projectId}/status`,
  );
  await expect(page.getByTestId("project-status-history")).toContainText(
    "puso el estado en En riesgo",
    { timeout: 30_000 },
  );
  await expect(page.getByTestId("project-status-history")).toContainText(
    "El cuadro llega tarde",
  );
});
