import { addTeammate, createTask, expect, test } from "./fixtures";

/**
 * Las tarjetas del tablero pintaban solo al responsable principal: una tarea
 * repartida entre dos personas parecia de una. Ahora llevan a todas.
 */
test("el tablero enseña a todos los asignados de una tarea", async ({
  page,
  riuna,
  browser,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const ana = await addTeammate({
    riuna,
    browser,
    origin: baseURL ?? "http://localhost:5174",
    name: "Ana",
  });
  const shared = await createTask(riuna, "Cuadro compartido");
  await createTask(riuna, "Tarea de una sola persona");
  await riuna.api("put", `/api/task/assignees/${shared}`, {
    userIds: [riuna.userId, ana.id],
  });

  await page.goto(
    `/dashboard/workspace/${riuna.workspaceId}/project/${riuna.projectId}/board`,
  );

  const card = page.getByText("Cuadro compartido").first();
  await expect(card).toBeVisible({ timeout: 30_000 });
  // El rotulo de la pila nombra a las dos personas.
  await expect(page.getByRole("img", { name: /Ana/ })).toBeVisible();
  await expect(page.getByRole("img", { name: /,/ })).toHaveCount(1);
});
