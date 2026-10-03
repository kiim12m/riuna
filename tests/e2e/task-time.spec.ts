import { createTask, expect, test } from "./fixtures";

/**
 * El tiempo de una tarea desde su detalle (sub-bloque 0.3 del interludio de
 * productividad): hasta ahora el cronometro solo arrancaba desde Hoy, no se
 * podia registrar tiempo a mano -los hooks existian sin que nada los usara- y
 * el plan personal solo se tocaba desde el Planificador.
 */
test.describe("Tiempo en el detalle de la tarea", () => {
  function taskUrl(
    riuna: { workspaceId: string; projectId: string },
    id: string,
  ) {
    return `/dashboard/workspace/${riuna.workspaceId}/project/${riuna.projectId}/task/${id}`;
  }

  test("arranca y para el cronómetro desde el detalle", async ({
    page,
    riuna,
  }) => {
    const taskId = await createTask(riuna, "Revisar acometida");

    await page.goto(taskUrl(riuna, taskId));
    await page
      .getByRole("button", { name: "Iniciar cronómetro" })
      .first()
      .click({ timeout: 30_000 });

    await expect(
      page.getByRole("button", { name: "Parar el cronómetro" }).first(),
    ).toBeVisible();
    const running = await riuna.api<{
      running: { task: { id: string } } | null;
    }>("get", `/api/time-entry/running?workspaceId=${riuna.workspaceId}`);
    expect(running.running?.task.id).toBe(taskId);

    await page
      .getByRole("button", { name: "Parar el cronómetro" })
      .first()
      .click();
    await expect(
      page.getByRole("button", { name: "Iniciar cronómetro" }).first(),
    ).toBeVisible();
  });

  test("registra tiempo a mano y sale en el parte de horas con su título", async ({
    page,
    riuna,
  }) => {
    const taskId = await createTask(riuna, "Medir cuadro general");

    await page.goto(taskUrl(riuna, taskId));
    await page
      .getByRole("button", { name: "Añadir tiempo" })
      .click({ timeout: 30_000 });
    await page.getByLabel("Inicio").fill("08:00");
    await page.getByLabel("Duración").fill("1h 30m");
    await page.getByRole("button", { name: "Guardar" }).click();

    await expect(page.getByTestId("task-time-logged")).toContainText("1,5 h");

    await page.goto(`/dashboard/workspace/${riuna.workspaceId}/time-sheet`);
    // Agrupado por dia, la entrada no tenia nombre: ahora lleva el de su
    // tarea.
    await page
      .locator('tbody [role="button"][aria-expanded="false"]')
      .first()
      .click();
    // Dentro de la tabla: el pie de la barra tambien lo nombra ("Reanudar ·
    // Medir cuadro general"), y sin acotar la prueba pasaba sin desplegar nada.
    await expect(
      page.locator("tbody").getByText("Medir cuadro general"),
    ).toBeVisible();
  });

  test("planifica la tarea para hoy desde el detalle", async ({
    page,
    riuna,
  }) => {
    const taskId = await createTask(riuna, "Pedir presupuesto de grúa");

    await page.goto(taskUrl(riuna, taskId));
    await page
      .getByRole("button", { name: "Sin planificar" })
      .click({ timeout: 30_000 });
    const today = new Date();
    // El calendario heredado nombra sus dias en ingles: se busca la celda de
    // hoy por el atributo de react-day-picker, no por su texto.
    await page.locator("[data-today] button").first().click();

    await expect(
      page.getByRole("button", { name: "Sin planificar" }),
    ).toHaveCount(0);
    const lookup = await riuna.api<{ entry: { plannedDay: string } | null }>(
      "get",
      `/api/planner/entry/${taskId}?workspaceId=${riuna.workspaceId}`,
    );
    const key = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, "0"),
      String(today.getDate()).padStart(2, "0"),
    ].join("-");
    expect(lookup.entry?.plannedDay).toBe(key);
  });
});
