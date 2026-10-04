import { createTask, expect, test } from "./fixtures";

/**
 * Tablero, Lista y Backlog filtran en el servidor, con el mismo motor que la
 * Tabla, el Calendario y el Gantt (ADR 065). Antes recortaban en el navegador,
 * cada uno a su manera: el Backlog ni siquiera filtraba por etiqueta.
 */
test.describe("Filtros de Tablero, Lista y Backlog", () => {
  const boardUrl = (riuna: { workspaceId: string; projectId: string }) =>
    `/dashboard/workspace/${riuna.workspaceId}/project/${riuna.projectId}/board`;
  const backlogUrl = (riuna: { workspaceId: string; projectId: string }) =>
    `/dashboard/workspace/${riuna.workspaceId}/project/${riuna.projectId}/backlog`;

  test("filtra el tablero por prioridad y se acuerda al recargar; la lista usa el mismo filtro", async ({
    page,
    riuna,
  }) => {
    await createTask(riuna, "Zanja urgente", { priority: "urgent" });
    await createTask(riuna, "Zanja baja", { priority: "low" });
    await createTask(riuna, "Cimiento urgente", { priority: "urgent" });

    await page.goto(boardUrl(riuna));
    await expect(page.getByText("Zanja baja")).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: "Filtrar" }).click();
    await page.getByRole("menuitem", { name: "Prioridad" }).click();
    await page.getByRole("button", { name: "Urgente", exact: true }).click();
    // Un Escape cierra el submenú y otro el menú.
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");

    await expect(page.getByText("Zanja urgente")).toBeVisible();
    await expect(page.getByText("Cimiento urgente")).toBeVisible();
    await expect(page.getByText("Zanja baja")).toHaveCount(0);

    await page.getByRole("button", { name: "Lista", exact: true }).click();
    await expect(page.getByText("Zanja urgente")).toBeVisible();
    await expect(page.getByText("Zanja baja")).toHaveCount(0);

    await page.reload();
    await expect(page.getByText("Zanja urgente")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("Zanja baja")).toHaveCount(0);
  });

  test("el buscador pide al servidor y encuentra por título o por número", async ({
    page,
    riuna,
  }) => {
    await createTask(riuna, "Zanja norte");
    await createTask(riuna, "Cimiento sur");

    await page.goto(boardUrl(riuna));
    await expect(page.getByText("Cimiento sur")).toBeVisible({
      timeout: 30_000,
    });

    await page.keyboard.press("Control+f");
    const search = page.getByPlaceholder("Buscar tickets...");
    await search.fill("zanja");
    await expect(page.getByText("Cimiento sur")).toHaveCount(0);
    await expect(page.getByText("Zanja norte")).toBeVisible();

    // La segunda tarea del proyecto es la número 2.
    await search.fill(`${riuna.projectSlug}-2`);
    await expect(page.getByText("Cimiento sur")).toBeVisible();
    await expect(page.getByText("Zanja norte")).toHaveCount(0);
  });

  test("una etiqueta se filtra por nombre: las tareas que la llevan salen todas", async ({
    page,
    riuna,
  }) => {
    const a = await createTask(riuna, "Con etiqueta A");
    const b = await createTask(riuna, "Con etiqueta B");
    await createTask(riuna, "Sin etiqueta");
    // Una etiqueta es una fila por tarea: lo que las une es el nombre.
    for (const taskId of [a, b]) {
      await riuna.api("post", "/api/label", {
        name: "Obra",
        color: "green",
        taskId,
        workspaceId: riuna.workspaceId,
      });
    }

    await page.goto(boardUrl(riuna));
    await expect(page.getByText("Sin etiqueta")).toBeVisible({
      timeout: 30_000,
    });

    await page.getByRole("button", { name: "Filtrar" }).click();
    await page.getByRole("menuitem", { name: "Etiquetas" }).click();
    await page.getByRole("menuitem", { name: "Obra" }).click();
    await page.keyboard.press("Escape");

    await expect(page.getByText("Con etiqueta A")).toBeVisible();
    await expect(page.getByText("Con etiqueta B")).toBeVisible();
    await expect(page.getByText("Sin etiqueta")).toHaveCount(0);
  });

  test("el Backlog filtra por prioridad y por etiqueta", async ({
    page,
    riuna,
  }) => {
    const alta = await createTask(riuna, "Plan alta", {
      status: "planned",
      priority: "high",
    });
    await createTask(riuna, "Plan baja", {
      status: "planned",
      priority: "low",
    });
    await riuna.api("post", "/api/label", {
      name: "Obra",
      color: "green",
      taskId: alta,
      workspaceId: riuna.workspaceId,
    });

    await page.goto(backlogUrl(riuna));
    await expect(page.getByText("Plan baja")).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: "Filtrar" }).click();
    await page.getByRole("menuitemcheckbox", { name: /Alta/ }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByText("Plan alta")).toBeVisible();
    await expect(page.getByText("Plan baja")).toHaveCount(0);

    // Quitar la prioridad y filtrar por etiqueta: antes el Backlog leía las
    // etiquetas de una caché que casi siempre estaba vacía y no traía nada.
    await page.getByRole("button", { name: "Filtrar" }).click();
    await page
      .getByRole("menuitem", { name: "Eliminar todos los filtros" })
      .click();
    await page.getByRole("button", { name: "Filtrar" }).click();
    await page.getByRole("menuitemcheckbox", { name: /Obra/ }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByText("Plan alta")).toBeVisible();
    await expect(page.getByText("Plan baja")).toHaveCount(0);
  });
});
