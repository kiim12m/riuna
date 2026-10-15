import { createTask, expect, test } from "./fixtures";

/** `yyyy-mm-dd` en hora local, para `PUT /planner/:taskId`. */
function serverDay(offsetDays: number) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * "Hoy": la pantalla de entrada del espacio (ADR 047). Compone el plan
 * personal del Planificador -"De dias anteriores", "Plan de hoy"- con lo
 * urgente sin planificar y lo hecho, y ofrece la casilla de marcar como
 * hecha directamente en la fila.
 */
test.describe("Hoy", () => {
  test("reparte el plan, lo de dias anteriores y lo urgente, y 'Añadir a hoy'/'Planificar hoy' las mete en el plan", async ({
    page,
    riuna,
  }) => {
    const dia = (n: number) =>
      new Date(Date.now() + n * 86_400_000).toISOString();

    const overdueId = await createTask(riuna, "Revisar factura", {
      dueDate: dia(-3),
    });
    const dueTodayId = await createTask(riuna, "Enviar informe", {
      dueDate: dia(0),
    });
    const previousId = await createTask(riuna, "Llamar al proveedor");

    for (const id of [overdueId, dueTodayId, previousId]) {
      await riuna.api("put", `/api/task/assignee/${id}`, {
        userId: riuna.userId,
      });
    }

    // Planificada ayer y sin terminar: "De dias anteriores".
    await riuna.api(
      "put",
      `/api/planner/${previousId}?workspaceId=${riuna.workspaceId}`,
      { plannedDate: serverDay(-1) },
    );

    await page.goto(`/dashboard/workspace/${riuna.workspaceId}/today`);

    await expect(
      page.getByRole("button", { name: /De días anteriores/ }),
    ).toBeVisible({ timeout: 30_000 });
    const previousRow = page.locator(`[data-testid="today-row-${previousId}"]`);
    await expect(previousRow).toBeVisible();

    await expect(
      page.getByRole("heading", {
        name: "Vence hoy o vencida, sin planificar",
      }),
    ).toBeVisible();
    const overdueRow = page.locator(`[data-testid="today-row-${overdueId}"]`);
    const dueTodayRow = page.locator(`[data-testid="today-row-${dueTodayId}"]`);
    await expect(overdueRow.getByText("Vencida")).toBeVisible();
    await expect(dueTodayRow.getByText("Vence hoy")).toBeVisible();

    // "Añadir a hoy" mete lo de dias anteriores en el plan de hoy.
    await previousRow.getByRole("button", { name: "Añadir a hoy" }).click();

    // "Planificar hoy" hace lo mismo con lo urgente.
    await overdueRow.getByRole("button", { name: "Planificar hoy" }).click();

    const plannedSection = page.locator("section", {
      has: page.getByRole("heading", { name: "Plan de hoy" }),
    });
    await expect(
      plannedSection.locator(`[data-testid="today-row-${previousId}"]`),
    ).toBeVisible();
    await expect(
      plannedSection.locator(`[data-testid="today-row-${overdueId}"]`),
    ).toBeVisible();
  });

  test("los títulos y las horas quedan en columna, con hora o sin ella", async ({
    page,
    riuna,
  }) => {
    const titles = ["Reintentos", "Integración de pagos", "API de catálogo"];
    const [timedId, untimedId, previousId] = await Promise.all(
      titles.map((title) => createTask(riuna, title, { estimate: 3600 })),
    );
    for (const id of [timedId, untimedId, previousId]) {
      await riuna.api("put", `/api/task/assignee/${id}`, {
        userId: riuna.userId,
      });
    }
    const plan = (id: string, body: Record<string, unknown>) =>
      riuna.api(
        "put",
        `/api/planner/${id}?workspaceId=${riuna.workspaceId}`,
        body,
      );
    await plan(timedId, { plannedDate: serverDay(0), startMinute: 480 });
    await plan(untimedId, { plannedDate: serverDay(0) });
    await plan(previousId, { plannedDate: serverDay(-1) });

    await page.goto(`/dashboard/workspace/${riuna.workspaceId}/today`);
    const rows = [timedId, untimedId, previousId].map((id) =>
      page.getByTestId(`today-row-${id}`),
    );
    await expect(rows[0].getByText("08:00")).toBeVisible({ timeout: 30_000 });
    await expect(rows[2]).toBeVisible();

    // Sin hora, la fila guarda el hueco: el titulo empieza donde los demas.
    const titleLefts = await Promise.all(
      rows.map(async (row, index) => {
        const box = await row
          .getByText(titles[index], { exact: true })
          .boundingBox();
        return box && Math.round(box.x);
      }),
    );
    expect(new Set(titleLefts).size).toBe(1);

    // «Añadir a hoy» va delante de las horas y no las saca de la columna.
    const hourRights = await Promise.all(
      rows.map(async (row) => {
        const box = await row
          .getByRole("button", { name: "1 h", exact: true })
          .boundingBox();
        return box && Math.round(box.x + box.width);
      }),
    );
    expect(new Set(hourRights).size).toBe(1);
  });

  test("marcar la casilla mueve la tarea a 'Hechas hoy'", async ({
    page,
    riuna,
  }) => {
    const taskId = await createTask(riuna, "Acta de replanteo");
    await riuna.api("put", `/api/task/assignee/${taskId}`, {
      userId: riuna.userId,
    });
    await riuna.api(
      "put",
      `/api/planner/${taskId}?workspaceId=${riuna.workspaceId}`,
      { plannedDate: serverDay(0) },
    );

    await page.goto(`/dashboard/workspace/${riuna.workspaceId}/today`);

    const row = page.locator(`[data-testid="today-row-${taskId}"]`);
    await expect(row).toBeVisible();
    await row
      .getByRole("checkbox", { name: "Marcar tarea como hecha" })
      .click();

    const plannedSection = page.locator("section", {
      has: page.getByRole("heading", { name: "Plan de hoy" }),
    });
    await expect(
      plannedSection.locator(`[data-testid="today-row-${taskId}"]`),
    ).toHaveCount(0);

    await page.getByRole("button", { name: /Hechas hoy/ }).click();
    await expect(
      page.locator(`[data-testid="today-row-${taskId}"]`),
    ).toBeVisible();
  });

  test("sin tareas asignadas se ve el estado vacio", async ({
    page,
    riuna,
  }) => {
    await page.goto(`/dashboard/workspace/${riuna.workspaceId}/today`);

    await expect(page.getByText("Nada pendiente")).toBeVisible();
  });

  // ADR 048: `MY_WORK_INVALIDATED` solo invalidaba "Mis tareas" y los
  // paneles, asi que una tarea que te asignaban no llegaba a Hoy hasta
  // recargar. La asignacion va por la API, fuera de la pestaña, igual que si
  // la hiciera otra persona desde su sesion.
  test("una tarea que te asignan desde fuera aparece en Hoy sin recargar", async ({
    page,
    riuna,
  }) => {
    const taskId = await createTask(riuna, "Revisar presupuesto de obra", {
      dueDate: new Date().toISOString(),
    });

    await page.goto(`/dashboard/workspace/${riuna.workspaceId}/today`);
    await expect(page.getByText("Nada pendiente")).toBeVisible();

    await riuna.api("put", `/api/task/assignee/${taskId}`, {
      userId: riuna.userId,
    });

    await expect(
      page.locator(`[data-testid="today-row-${taskId}"]`),
    ).toBeVisible();
  });

  // ADR 048: en movil la barra lateral es un panel que solo existe abierto, y
  // la conexion del canal de usuario y la campana vivian dentro. Con el panel
  // cerrado -casi siempre- no habia contador ni tiempo real.
  test("en móvil la campana de la cabecera cuenta en vivo con la barra cerrada", async ({
    page,
    riuna,
  }) => {
    // Crear el espacio ya deja una notificacion: se empieza de cero.
    await riuna.api("delete", "/api/notification/clear-all");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/dashboard/workspace/${riuna.workspaceId}/today`);
    await expect(page.getByText("Nada pendiente")).toBeVisible({
      timeout: 30_000,
    });

    const bell = page
      .locator("header")
      .getByRole("button", { name: "Notificaciones" });
    await expect(bell).toBeVisible();
    await expect(bell).not.toContainText("1");

    await riuna.api("post", "/api/notification", {
      type: "task_created",
      title: "Aviso de prueba",
      message: "Aviso de prueba",
    });

    await expect(bell).toContainText("1");
  });

  // ADR 048: el cliente global no relee al montar, asi que una pantalla
  // invalidada mientras no estaba abierta enseñaba lo de antes al volver.
  test("al volver a Hoy desde el Planificador se ve lo planificado mientras tanto", async ({
    page,
    riuna,
  }) => {
    const taskId = await createTask(riuna, "Pedir material eléctrico");
    await riuna.api("put", `/api/task/assignee/${taskId}`, {
      userId: riuna.userId,
    });

    await page.goto(`/dashboard/workspace/${riuna.workspaceId}/today`);
    await expect(page.getByText("Nada pendiente")).toBeVisible();

    await page
      .getByRole("button", { name: "Planificador", exact: true })
      .click();
    await expect(page.getByText("Pedir material eléctrico")).toBeVisible();

    await riuna.api(
      "put",
      `/api/planner/${taskId}?workspaceId=${riuna.workspaceId}`,
      { plannedDate: serverDay(0) },
    );

    await page.getByRole("button", { name: "Hoy", exact: true }).click();

    const plannedSection = page.locator("section", {
      has: page.getByRole("heading", { name: "Plan de hoy" }),
    });
    await expect(
      plannedSection.locator(`[data-testid="today-row-${taskId}"]`),
    ).toBeVisible();
  });
});
