import { createTask, expect, test } from "./fixtures";

/**
 * Un "Presupuesto" de la obra entera: la tarjeta «Rama» del detalle suma un
 * campo de moneda sobre toda la rama, la propia tarea incluida.
 */
test("la rama suma el presupuesto de sus tareas", async ({ page, riuna }) => {
  await riuna.api("post", `/api/field/project/${riuna.projectId}`, {
    name: "Presupuesto",
    type: "currency",
    config: { currency: "EUR" },
  });

  const root = await createTask(riuna, "Obra");
  const child = await createTask(riuna, "Cimentación", { parentId: root });
  const grandchild = await createTask(riuna, "Zapatas", { parentId: child });
  for (const [id, presupuesto] of [
    [root, 1000],
    [child, 250.5],
    [grandchild, 100],
  ] as const) {
    await riuna.api("put", `/api/task/custom-fields/${id}`, {
      values: { presupuesto },
    });
  }

  await page.goto(
    `/dashboard/workspace/${riuna.workspaceId}/project/${riuna.projectId}/task/${root}`,
  );

  // 1000 + 250,50 + 100, con el formato de moneda del navegador (es-ES, que no
  // pone separador de millares en cifras de cuatro digitos).
  await expect(page.getByTestId("branch-sum-presupuesto")).toHaveText(
    /1\.?350,50\s*€/,
    { timeout: 30_000 },
  );
});
