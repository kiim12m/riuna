import { createTask, expect, test } from "./fixtures";

/**
 * El historial de un campo personalizado se lee como lo ve la persona: la
 * etiqueta de la opcion y no su clave, y la fecha como fecha.
 */
test("el historial de un campo muestra la etiqueta de la opción y la fecha legible", async ({
  page,
  riuna,
}) => {
  await riuna.api("post", `/api/field/project/${riuna.projectId}`, {
    name: "Fase",
    type: "select",
    config: {
      options: [
        { value: "f1", label: "Cimentación" },
        { value: "f2", label: "Obra gruesa" },
      ],
    },
  });
  await riuna.api("post", `/api/field/project/${riuna.projectId}`, {
    name: "Entrega",
    type: "date",
  });
  const taskId = await createTask(riuna, "Bloque A");
  await riuna.api("put", `/api/task/custom-fields/${taskId}`, {
    values: { fase: "f1" },
  });
  await riuna.api("put", `/api/task/custom-fields/${taskId}`, {
    values: { fase: "f2", entrega: "2026-11-20" },
  });

  await page.goto(
    `/dashboard/workspace/${riuna.workspaceId}/project/${riuna.projectId}/board?taskId=${taskId}`,
  );

  await expect(
    page.getByText("cambiado «Fase» de Cimentación a Obra gruesa"),
  ).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByText(/cambiado «Entrega» de .* a 20 nov/),
  ).toBeVisible();
  await expect(page.getByText(/«Fase» de f1 a f2/)).toHaveCount(0);
});
