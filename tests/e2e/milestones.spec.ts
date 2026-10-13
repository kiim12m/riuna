import { createTask, expect, test } from "./fixtures";
import { plusDays, upcomingMonday } from "./schedule-dates";

/** Hitos (ADR 082): se marca en el detalle y sale como rombo en el Gantt. */
test("una tarea se marca como hito y sale como rombo en el Gantt", async ({
  page,
  riuna,
}) => {
  const id = await createTask(riuna, "Entrega de llaves", {
    startDate: upcomingMonday().toISOString(),
    dueDate: plusDays(upcomingMonday(), 2).toISOString(),
  });

  await page.goto(
    `/dashboard/workspace/${riuna.workspaceId}/project/${riuna.projectId}/task/${id}`,
  );
  // El lateral sale en varias maquetas y solo una se ve: por su rol, la
  // visible.
  const toggle = page.getByRole("button", { name: "Hito" });
  await expect(toggle).toHaveAttribute("aria-pressed", "false", {
    timeout: 30_000,
  });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");

  // Un hito tiene una sola fecha: el inicio pasa a ser el vencimiento.
  const task = await riuna.api<{ startDate: string; dueDate: string }>(
    "get",
    `/api/task/${id}`,
  );
  expect(task.startDate).toBe(task.dueDate);

  await page.goto(
    `/dashboard/workspace/${riuna.workspaceId}/project/${riuna.projectId}/gantt`,
  );
  await expect(page.getByTestId("gantt-milestone")).toBeVisible({
    timeout: 30_000,
  });
});
