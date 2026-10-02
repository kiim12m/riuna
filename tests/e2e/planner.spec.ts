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

/**
 * Sub-bloque 0.4 del interludio de productividad: la zona "con hora" solo se
 * pintaba con filas dentro, no habia casilla de hecha, y soltar en "Sin
 * planificar" una tarjeta que ya estaba ahi mandaba un DELETE en balde.
 */
test.describe("Planificador: anclar, hecha y sin planificar", () => {
  async function drag(
    page: import("@playwright/test").Page,
    from: import("@playwright/test").Locator,
    to: import("@playwright/test").Locator,
  ) {
    const fromBox = await from.boundingBox();
    const toBox = await to.boundingBox();
    if (!fromBox || !toBox) throw new Error("No se pudo medir el arrastre");
    await page.mouse.move(
      fromBox.x + fromBox.width / 2,
      fromBox.y + fromBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      fromBox.x + fromBox.width / 2 + 30,
      fromBox.y + fromBox.height / 2,
      { steps: 5 },
    );
    await page.mouse.move(
      toBox.x + toBox.width / 2,
      toBox.y + toBox.height / 2,
      { steps: 10 },
    );
    await page.mouse.up();
  }

  test("ancla una tarea en un día sin nada con hora", async ({
    page,
    riuna,
  }) => {
    const taskId = await createTask(riuna, "Llamar a la ingeniería");
    await riuna.api("put", `/api/task/assignee/${taskId}`, {
      userId: riuna.userId,
    });

    await page.goto(`/dashboard/workspace/${riuna.workspaceId}/planner`);
    const card = page
      .locator('[data-testid="planner-column-unplanned"]')
      .getByText("Llamar a la ingeniería");
    await expect(card).toBeVisible({ timeout: 20_000 });

    await drag(
      page,
      card,
      page.locator(`[data-testid="planner-timed-${todayColumnId()}"]`),
    );

    // Anclada al inicio de la jornada por defecto (09:00) y con el selector
    // de hora abierto para ajustarla.
    await expect
      .poll(async () => {
        const lookup = await riuna.api<{
          entry: { plannedDay: string; startMinute: number | null } | null;
        }>(
          "get",
          `/api/planner/entry/${taskId}?workspaceId=${riuna.workspaceId}`,
        );
        return lookup.entry;
      })
      .toEqual({ plannedDay: todayColumnId(), startMinute: 540 });
  });

  test("marca una tarea como hecha desde su tarjeta", async ({
    page,
    riuna,
  }) => {
    const taskId = await createTask(riuna, "Firmar el acta");
    await riuna.api("put", `/api/task/assignee/${taskId}`, {
      userId: riuna.userId,
    });
    await riuna.api(
      "put",
      `/api/planner/${taskId}?workspaceId=${riuna.workspaceId}`,
      { plannedDate: todayColumnId() },
    );

    await page.goto(`/dashboard/workspace/${riuna.workspaceId}/planner`);
    const todayColumn = page.locator(
      `[data-testid="planner-column-${todayColumnId()}"]`,
    );
    await expect(todayColumn.getByText("Firmar el acta")).toBeVisible({
      timeout: 20_000,
    });
    await todayColumn
      .getByRole("checkbox", { name: "Marcar tarea como hecha" })
      .click();

    await expect
      .poll(async () => {
        const task = await riuna.api<{ completedAt: string | null }>(
          "get",
          `/api/task/${taskId}`,
        );
        return Boolean(task.completedAt);
      })
      .toBe(true);
    // Abrir el detalle no ha pasado: la casilla no se come la fila.
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("soltar en «Sin planificar» lo que ya estaba ahí no manda nada", async ({
    page,
    riuna,
  }) => {
    const first = await createTask(riuna, "Primera sin planificar");
    const second = await createTask(riuna, "Segunda sin planificar");
    for (const id of [first, second]) {
      await riuna.api("put", `/api/task/assignee/${id}`, {
        userId: riuna.userId,
      });
    }

    await page.goto(`/dashboard/workspace/${riuna.workspaceId}/planner`);
    const column = page.locator('[data-testid="planner-column-unplanned"]');
    await expect(column.getByText("Segunda sin planificar")).toBeVisible({
      timeout: 20_000,
    });

    const plannerWrites: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/planner/") && request.method() !== "GET")
        plannerWrites.push(`${request.method()} ${request.url()}`);
    });

    await drag(
      page,
      column.getByText("Primera sin planificar"),
      column.getByText("Segunda sin planificar"),
    );
    await page.waitForTimeout(500);
    expect(plannerWrites).toEqual([]);
  });
});
