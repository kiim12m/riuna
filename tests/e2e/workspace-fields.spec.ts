import { createTask, expect, test } from "./fixtures";

/**
 * «Mis tareas» cruza proyectos, asi que solo puede filtrar por los campos
 * personalizados **del espacio**, que hasta ahora no ofrecia: la API los
 * aceptaba y no habia quien los listara fuera de un proyecto.
 */
test("Mis tareas filtra por un campo personalizado del espacio", async ({
  page,
  riuna,
}) => {
  await riuna.api("post", `/api/field/workspace/${riuna.workspaceId}`, {
    name: "Presupuesto",
    type: "number",
  });

  for (const [title, presupuesto] of [
    ["Cuadro pequeño", 500],
    ["Cuadro grande", 1500],
  ] as const) {
    const id = await createTask(riuna, title);
    await riuna.api("put", `/api/task/assignee/${id}`, {
      userId: riuna.userId,
    });
    await riuna.api("put", `/api/task/custom-fields/${id}`, {
      values: { presupuesto },
    });
  }

  await page.goto(`/dashboard/workspace/${riuna.workspaceId}/my-tasks/table`);
  await expect(page.getByText("Cuadro pequeño")).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText("Cuadro grande")).toBeVisible();

  await page.getByRole("button", { name: "Añadir un filtro" }).click();
  // El primer desplegable es el del campo.
  await page.getByRole("combobox").first().click();
  await page.getByRole("option", { name: "Presupuesto" }).click();
  await page.getByRole("combobox").nth(1).click();
  await page.getByRole("option", { name: "mayor que" }).click();
  await page.getByPlaceholder("Valor").fill("1000");

  await expect(page.getByText("Cuadro pequeño")).toHaveCount(0);
  await expect(page.getByText("Cuadro grande")).toBeVisible();
});
