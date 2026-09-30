import { createTask, expect, test } from "./fixtures";

/**
 * El mismo calculo de "hoy" que usa la ruta, para dar con su `data-testid`.
 * `yyyy-mm-dd`, no un instante: es el mismo `serverDayKey` que manda la API
 * en `serverToday` y que `planner.tsx` usa como id de columna.
 */
function todayColumnId() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * El Planificador: ventana rodante de 15 dias sobre `personal_plan_entry`
 * (ADR 040). Lo que un navegador de verdad puede ver que ninguna prueba de
 * API puede: que arrastrar una tarjeta entre columnas no mueve `due_date`.
 */
test.describe("Planificador", () => {
  test("arrastra una tarjeta de sin planificar a un dia sin tocar el vencimiento", async ({
    page,
    riuna,
  }) => {
    const dueDate = new Date(Date.now() + 10 * 86_400_000).toISOString();
    const taskId = await createTask(riuna, "Revisar cuadro electrico", {
      dueDate,
    });
    await riuna.api("put", `/api/task/assignee/${taskId}`, {
      userId: riuna.userId,
    });

    await page.goto(`/dashboard/workspace/${riuna.workspaceId}/planner`);

    const unplannedColumn = page.locator(
      '[data-testid="planner-column-unplanned"]',
    );
    const todayColumn = page.locator(
      `[data-testid="planner-column-${todayColumnId()}"]`,
    );

    const card = unplannedColumn.getByText("Revisar cuadro electrico");
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(todayColumn).toBeVisible();

    // No `dragTo`: es para el HTML5 nativo, y dnd-kit escucha punteros. Hacen
    // falta pasos intermedios para cruzar el umbral de activacion (8 px).
    const cardBox = await card.boundingBox();
    const columnBox = await todayColumn.boundingBox();
    if (!cardBox || !columnBox) {
      throw new Error("No se pudo medir el arrastre");
    }

    await page.mouse.move(
      cardBox.x + cardBox.width / 2,
      cardBox.y + cardBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      cardBox.x + cardBox.width / 2 + 30,
      cardBox.y + cardBox.height / 2,
      { steps: 5 },
    );
    await page.mouse.move(
      columnBox.x + columnBox.width / 2,
      columnBox.y + columnBox.height / 2,
      { steps: 10 },
    );
    await page.mouse.up();

    // Se movio de columna: aparece en la de hoy y desaparece de "sin
    // planificar", no solo "sigue habiendo una".
    await expect(
      todayColumn.getByText("Revisar cuadro electrico"),
    ).toBeVisible();
    await expect(
      unplannedColumn.getByText("Revisar cuadro electrico"),
    ).toHaveCount(0);

    // La invariante de la ADR 040, comprobada contra la API real.
    const task = await riuna.api<{ dueDate: string }>(
      "get",
      `/api/task/${taskId}`,
    );
    expect(new Date(task.dueDate).toISOString()).toBe(dueDate);
  });

  test("proyecta un fantasma de una recurrencia activa", async ({
    page,
    riuna,
  }) => {
    await riuna.api("post", `/api/recurrence/project/${riuna.projectId}`, {
      template: {
        title: "Parte semanal",
        priority: "medium",
        assigneeId: riuna.userId,
      },
      cadence: { frequency: "daily", interval: 1 },
      startsAt: new Date().toISOString(),
    });

    await page.goto(`/dashboard/workspace/${riuna.workspaceId}/planner`);

    // Diaria: se proyecta en las 15 columnas de la ventana, no en una sola.
    await expect(page.getByText("Parte semanal").first()).toBeVisible({
      timeout: 20_000,
    });
    expect(await page.getByText("Parte semanal").count()).toBe(15);
  });

  test("'Nueva tarea' en la cabecera la crea asignada y sale en sin planificar sin recargar", async ({
    page,
    riuna,
  }) => {
    await page.goto(`/dashboard/workspace/${riuna.workspaceId}/planner`);

    await page.getByRole("button", { name: "Nueva tarea" }).click();
    const dialog = page.getByRole("dialog");
    // Fuera de un proyecto el dialogo pide uno: no hay ruta de donde sacarlo.
    await dialog.getByRole("button", { name: "Seleccionar proyecto" }).click();
    await page.getByRole("button", { name: "Proyecto E2E" }).click();
    await dialog
      .getByPlaceholder("Título de la tarea")
      .fill("Llamar al proveedor");
    await dialog.getByRole("button", { name: "Crear tarea" }).click();

    // "Sin planificar" solo lista lo asignado a quien mira: que salga aqui
    // prueba a la vez la asignacion por defecto y la invalidacion de la
    // consulta del Planificador.
    await expect(
      page
        .locator('[data-testid="planner-column-unplanned"]')
        .getByText("Llamar al proveedor"),
    ).toBeVisible({ timeout: 10_000 });
  });
});
