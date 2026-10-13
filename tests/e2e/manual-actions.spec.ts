import { createTask, expect, test } from "./fixtures";

type Column = { id: string; slug: string; name: string };

/**
 * Acciones de un clic (ADR 078): una regla con «Se pulsa el botón» sale en el
 * detalle de la tarea que cumple su «Si» y la mueve al pulsarla.
 */
test("pulsar «Enviar a revisión» en el detalle mueve la tarea", async ({
  page,
  riuna,
}) => {
  const columns = await riuna.api<Column[]>(
    "get",
    `/api/column/${riuna.projectId}`,
  );
  const review = columns.find((column) => column.slug === "in-review");
  if (!review) throw new Error("The project has no review column");

  await riuna.api("post", `/api/automation/project/${riuna.projectId}`, {
    name: "Enviar a revisión",
    trigger: { type: "manual" },
    conditions: [
      {
        id: "c1",
        field: "priority",
        operator: "in",
        value: ["high", "urgent"],
      },
    ],
    actions: [{ id: "a1", type: "move", columnId: review.id }],
  });
  const taskId = await createTask(riuna, "Instalación eléctrica", {
    priority: "high",
  });
  const quiet = await createTask(riuna, "Pintar la fachada", {
    priority: "low",
  });

  await page.goto(
    `/dashboard/workspace/${riuna.workspaceId}/project/${riuna.projectId}/board?taskId=${taskId}`,
  );
  const actions = page.getByTestId("task-manual-actions");
  await actions
    .getByRole("button", { name: "Enviar a revisión" })
    .click({ timeout: 30_000 });
  await expect(page.getByText("«Enviar a revisión» hecho")).toBeVisible();

  await expect
    .poll(
      async () =>
        (await riuna.api<{ status: string }>("get", `/api/task/${taskId}`))
          .status,
    )
    .toBe(review.slug);

  // La otra no cumple el «Si»: la API no la ofrece y el detalle, ya cargado,
  // no pinta ningún botón.
  const offered = await riuna.api<unknown[]>(
    "get",
    `/api/automation/manual/task/${quiet}`,
  );
  expect(offered).toEqual([]);
  await page.goto(
    `/dashboard/workspace/${riuna.workspaceId}/project/${riuna.projectId}/board?taskId=${quiet}`,
  );
  await expect(
    page.getByTestId("task-watchers-button").filter({ visible: true }),
  ).toHaveText(/Observando\s*1/, { timeout: 30_000 });
  await expect(page.getByTestId("task-manual-actions")).toHaveCount(0);
});
