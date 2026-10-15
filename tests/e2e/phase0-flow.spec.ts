import { createTask, expect, test } from "./fixtures";

/**
 * El humo de la Fase 0: iniciar sesion → crear un proyecto → descomponer una
 * tarea en subtareas → moverla en el tablero → exportar. Es el recorrido que el
 * plan pedia desde el principio y que ninguna fase escribio. El campo
 * personalizado, el filtro y la vista guardada tienen su caso propio
 * (`table-gestures.spec.ts`), y la importacion tambien (`import-wizard.spec.ts`).
 *
 * El inicio de sesion se hace por el formulario de verdad: el resto de pruebas
 * lo saltan, montando la sesion por la API.
 */
test("inicia sesión, crea un proyecto, subdivide una tarea, la mueve y exporta", async ({
  page,
  riuna,
}) => {
  const taskId = await createTask(riuna, "Cuadro general");

  // 1. Iniciar sesion por el formulario.
  await page.context().clearCookies();
  await page.goto("/auth/sign-in");
  await page.getByLabel("Correo o usuario").fill(riuna.email);
  await page.locator('input[type="password"]').fill("E2e-passw0rd!");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });

  // 2. Crear un proyecto desde la barra lateral.
  await page
    .getByRole("button", { name: "Añadir proyecto" })
    .click({ timeout: 30_000 });
  await page.getByPlaceholder("Nombre del proyecto").fill("Obra fase cero");
  await page.getByRole("button", { name: "Crear proyecto" }).click();
  await expect(page.getByText("Obra fase cero").first()).toBeVisible({
    timeout: 30_000,
  });

  // 3. Dos subtareas, desde el detalle de la tarea.
  await page.goto(
    `/dashboard/workspace/${riuna.workspaceId}/project/${riuna.projectId}/task/${taskId}`,
  );
  for (const title of ["Replanteo", "Acopio de material"]) {
    await page
      .getByRole("button", { name: "Añadir Sub-tareas" })
      .click({ timeout: 30_000 });
    await page.getByPlaceholder("Título de la subtarea...").fill(title);
    await page.getByRole("button", { name: "Añadir", exact: true }).click();
    await expect(page.getByText(title)).toBeVisible();
  }

  // 4. Moverla en el tablero, arrastrando.
  await page.goto(
    `/dashboard/workspace/${riuna.workspaceId}/project/${riuna.projectId}/board`,
  );
  const card = page.getByText("Cuadro general").first();
  await expect(card).toBeVisible({ timeout: 30_000 });
  const target = page.getByText("En curso", { exact: true }).first();
  const from = await card.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error("no se pudo medir el tablero");
  await page.mouse.move(from.x + 10, from.y + 10);
  await page.mouse.down();
  await page.mouse.move(from.x + 40, from.y + 40, { steps: 5 });
  await page.mouse.move(to.x + 40, to.y + 120, { steps: 20 });
  await page.mouse.up();

  await expect
    .poll(async () => {
      const task = await riuna.api<{ status: string }>(
        "get",
        `/api/task/${taskId}`,
      );
      return task.status;
    })
    .toBe("in-progress");

  // 5. Exportar a Excel desde los ajustes del proyecto.
  await page.goto(
    `/dashboard/workspace/${riuna.workspaceId}/admin/project-settings/${riuna.projectId}/general`,
  );
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Exportar a Excel" })
    .click({ timeout: 30_000 });
  expect((await download).suggestedFilename()).toMatch(/\.xlsx$/);
  // El aviso de carga se cierra al acabar (se quedaba hasta recargar).
  await expect(page.getByText("Tareas exportadas correctamente")).toBeVisible();
  await expect(page.getByText("Exportando tareas...")).toBeHidden();
});
