import { createTask, expect, test } from "./fixtures";
import { localDay, plusDays, upcomingMonday } from "./schedule-dates";

/**
 * Tareas resumen (ADR 083): un padre con fechas propias que sus subtareas
 * desbordan avisa en el detalle, y al pasar a fechas automáticas toma las de
 * su rama.
 */
test("un padre desbordado avisa y pasa a fechas automáticas", async ({
  page,
  riuna,
}) => {
  const monday = upcomingMonday();
  const parent = await createTask(riuna, "Instalación eléctrica", {
    startDate: monday.toISOString(),
    dueDate: plusDays(monday, 2).toISOString(),
  });
  await createTask(riuna, "Cableado", {
    parentId: parent,
    startDate: plusDays(monday, 1).toISOString(),
    dueDate: plusDays(monday, 7).toISOString(),
  });

  await page.goto(
    `/dashboard/workspace/${riuna.workspaceId}/project/${riuna.projectId}/task/${parent}`,
  );
  const alert = page.getByTestId("task-schedule-alert");
  // Del miercoles al lunes siguiente: jueves, viernes y lunes.
  await expect(alert).toContainText("3 días laborables después", {
    timeout: 30_000,
  });

  await alert
    .getByRole("button", { name: "Pasar a fechas automáticas" })
    .click();
  await expect(alert).toBeHidden();
  // El lateral sale en varias maquetas y solo una se ve: por su rol, la
  // visible.
  await expect(
    page.getByRole("button", { name: "Fechas: automáticas" }),
  ).toBeVisible();

  const task = await riuna.api<{ startDate: string; dueDate: string }>(
    "get",
    `/api/task/${parent}`,
  );
  expect(localDay(task.startDate)).toBe(localDay(plusDays(monday, 1)));
  expect(localDay(task.dueDate)).toBe(localDay(plusDays(monday, 7)));
});
