import { createTask, expect, test } from "./fixtures";

/**
 * Rebanada 2 de la Fase 6, que es el criterio de aceptacion de la fase:
 * «cierras un sprint y ves velocidad real y horas por persona».
 *
 * Aqui se recorre entero: crear, empezar, meter trabajo, terminarlo, ver el
 * informe y cerrar. Ninguna prueba de API llega a la grafica ni al dialogo.
 */
test.describe("Ciclos", () => {
  test("runs a sprint from empty state to closed", async ({ page, riuna }) => {
    const done = await createTask(riuna, "Terminada dentro", {
      estimate: 3600,
    });
    const pending = await createTask(riuna, "Se queda fuera");

    await page.goto(
      `/dashboard/workspace/${riuna.workspaceId}/project/${riuna.projectId}/cycles`,
    );

    // Estado vacio propio, no uno generico.
    await expect(page.getByText("Todavía no hay ciclos")).toBeVisible();

    await page.getByRole("button", { name: "Nuevo ciclo" }).first().click();
    await page.getByLabel("Nombre").fill("Sprint 1");
    await page.getByRole("button", { name: "Crear ciclo" }).click();

    await expect(page.getByText("Sprint 1")).toBeVisible();
    // Coincidencia exacta: sin ella tambien casa con la entrada de barra
    // lateral "Planificador" del interludio (empieza igual, "Planifica...").
    await expect(page.getByText("Planificado", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Empezar ciclo" }).click();
    await expect(page.getByText("Activo")).toBeVisible();

    // Las dos tareas entran en el ciclo. Se hace por API porque lo que esta
    // prueba mide es el informe y el cierre, no el selector —que tiene su
    // propia prueba—.
    const cycles = await riuna.api<Array<{ id: string; name: string }>>(
      "get",
      `/api/cycle/project/${riuna.projectId}`,
    );
    const cycleId = cycles.find((cycle) => cycle.name === "Sprint 1")?.id;
    expect(cycleId).toBeTruthy();

    for (const taskId of [done, pending]) {
      await riuna.api("put", `/api/cycle/task/${taskId}`, { cycleId });
    }
    await riuna.api("put", `/api/task/status/${done}`, { status: "done" });

    await page.reload();

    // Las cuatro fichas de cabecera y el burndown.
    await expect(page.getByText("Completadas")).toBeVisible();
    await expect(page.getByText("1/2")).toBeVisible();
    // "Velocidad" es a la vez ficha de cabecera y titulo de seccion, asi que el
    // localizador tiene que decir cual de las dos.
    await expect(
      page.getByRole("heading", { name: "Velocidad" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Burndown" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Horas por persona" }),
    ).toBeVisible();

    // Cerrar dice cuantas quedan **antes** de preguntar: es la mitad de la
    // decision y la razon de que no se arrastre solo.
    await page.getByRole("button", { name: "Cerrar ciclo" }).click();
    await expect(
      page.getByText("Queda 1 tarea sin terminar. ¿Dónde va?"),
    ).toBeVisible();

    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Cerrar ciclo" })
      .click();

    await expect(page.getByText("Cerrado")).toBeVisible();

    // Lo terminado se queda dentro —es lo que la velocidad mide— y lo pendiente
    // vuelve al backlog.
    const after = await riuna.api<Array<{ cycleId: string | null }>>(
      "get",
      `/api/cycle/project/${riuna.projectId}`,
    );
    expect(after).toHaveLength(1);

    // El listado viene envuelto en `data`, como lo desenvuelve el fetcher web.
    const tasks = await riuna.api<{
      data: {
        columns: Array<{
          tasks: Array<{ id: string; cycleId: string | null }>;
        }>;
      };
    }>("get", `/api/task/tasks/${riuna.projectId}`);
    const flat = tasks.data.columns.flatMap((column) => column.tasks);
    expect(flat.find((task) => task.id === done)?.cycleId).toBe(cycleId);
    expect(flat.find((task) => task.id === pending)?.cycleId).toBeNull();
  });

  // El conmutador tareas/horas es la decision de no usar doble eje: una unidad
  // cada vez.
  test("switches the chart unit between tasks and hours", async ({
    page,
    riuna,
  }) => {
    await riuna.api("post", `/api/cycle/project/${riuna.projectId}`, {
      name: "Sprint con unidades",
      startDate: new Date(Date.now() - 86_400_000).toISOString(),
      endDate: new Date(Date.now() + 86_400_000 * 6).toISOString(),
    });

    await page.goto(
      `/dashboard/workspace/${riuna.workspaceId}/project/${riuna.projectId}/cycles`,
    );

    // Acotado al control, no a la pagina: «Tareas» tambien rotula la pestaña de
    // proyecto, asi que buscarlo suelto encontraba dos botones distintos.
    const unidad = page.getByRole("group", { name: "Unidad del burndown" });
    const tasksButton = unidad.getByRole("button", {
      name: "Tareas",
      exact: true,
    });
    const hoursButton = unidad.getByRole("button", {
      name: "Horas",
      exact: true,
    });

    await expect(tasksButton).toHaveAttribute("aria-pressed", "true");
    await hoursButton.click();
    await expect(hoursButton).toHaveAttribute("aria-pressed", "true");
    await expect(tasksButton).toHaveAttribute("aria-pressed", "false");
  });
});
