import { createTask, expect, test } from "./fixtures";
import { localDay, plusDays, upcomingMonday } from "./schedule-dates";

/**
 * Precedencias (ADR 084): «Sigue a» desde el detalle ata la tarea al fin de su
 * predecesora, y cambiar el desfase la mueve en días laborables.
 */
test("una tarea sigue a otra y el desfase la mueve", async ({
  page,
  riuna,
}) => {
  const monday = upcomingMonday();
  await createTask(riuna, "Solera", {
    startDate: monday.toISOString(),
    dueDate: plusDays(monday, 2).toISOString(),
  });
  const follower = await createTask(riuna, "Alicatado", {
    startDate: plusDays(monday, 14).toISOString(),
    dueDate: plusDays(monday, 15).toISOString(),
  });
  const dates = async () => {
    const task = await riuna.api<{ startDate: string; dueDate: string }>(
      "get",
      `/api/task/${follower}`,
    );
    return [localDay(task.startDate), localDay(task.dueDate)];
  };

  await page.goto(
    `/dashboard/workspace/${riuna.workspaceId}/project/${riuna.projectId}/task/${follower}`,
  );
  await page.getByRole("button", { name: "Añadir relación" }).click({
    timeout: 30_000,
  });
  await page.getByTestId("relation-type-follows").click();
  await page.getByPlaceholder("Buscar tareas para vincular...").fill("Solera");
  await page.getByRole("option", { name: /Solera/ }).click();

  await expect(page.getByTestId("relation-lag")).toHaveText("desfase 0 d");
  // Empieza el jueves, al dia siguiente del fin, y conserva sus dos dias.
  await expect
    .poll(dates)
    .toEqual([localDay(plusDays(monday, 3)), localDay(plusDays(monday, 4))]);

  await page.getByTestId("relation-lag").click();
  const lag = page.getByLabel("Desfase (días lab.)");
  await lag.fill("2");
  await lag.press("Enter");
  // Dos laborables mas: del jueves al lunes siguiente.
  await expect
    .poll(dates)
    .toEqual([localDay(plusDays(monday, 7)), localDay(plusDays(monday, 8))]);
});
