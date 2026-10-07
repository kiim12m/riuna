import { createTask, expect, test } from "./fixtures";

/**
 * Lo que hace una automatizacion es de la regla, no de quien la guardo
 * (ADR 067): la actividad de la tarea la nombra a ella.
 */
test("la actividad nombra a la automatización que cambió la tarea", async ({
  page,
  riuna,
}) => {
  await riuna.api("post", `/api/automation/project/${riuna.projectId}`, {
    name: "Todo urgente",
    trigger: { type: "task.created" },
    actions: [{ id: "a1", type: "priority", priority: "urgent" }],
  });
  const taskId = await createTask(riuna, "Llamar al cliente");
  await expect
    .poll(async () => {
      const task = await riuna.api<{ priority: string }>(
        "get",
        `/api/task/${taskId}`,
      );
      return task.priority;
    })
    .toBe("urgent");

  await page.goto(
    `/dashboard/workspace/${riuna.workspaceId}/project/${riuna.projectId}/board?taskId=${taskId}`,
  );

  await expect(page.getByText("Automatización «Todo urgente»")).toBeVisible({
    timeout: 30_000,
  });
});
