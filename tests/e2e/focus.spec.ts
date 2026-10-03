import { createTask, expect, test } from "./fixtures";

function keyOf(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

type Entry = {
  focusMode: string | null;
  endTime: string | null;
  duration: number | null;
};

/**
 * El modo foco (sub-bloque 3.2 del interludio de productividad, ADR 056): un
 * pomodoro registra su bloque como sesion de foco, el descanso no registra
 * nada, y el cronometro del servidor manda sobre la sesion.
 */
test.describe("Modo foco", () => {
  test("un pomodoro trabaja, descansa sin registrar y termina si el cronómetro se para fuera", async ({
    page,
    riuna,
  }) => {
    const taskId = await createTask(riuna, "Redactar informe");
    await riuna.api("put", `/api/task/assignee/${taskId}`, {
      userId: riuna.userId,
    });
    await riuna.api(
      "put",
      `/api/planner/${taskId}?workspaceId=${riuna.workspaceId}`,
      { plannedDate: keyOf(new Date()) },
    );
    const entries = () =>
      riuna.api<Entry[]>("get", `/api/time-entry/task/${taskId}`);
    const running = async () =>
      (
        await riuna.api<{ running: { task: { id: string } } | null }>(
          "get",
          `/api/time-entry/running?workspaceId=${riuna.workspaceId}`,
        )
      ).running?.task.id ?? null;

    await page.clock.install({ time: new Date() });
    await page.goto(`/dashboard/workspace/${riuna.workspaceId}/today`);
    await page
      .getByTestId(`today-row-${taskId}`)
      .getByRole("button", { name: "Acciones de la tarea" })
      .click({ timeout: 30_000 });
    await page.getByRole("menuitem", { name: "Modo foco" }).click();

    await expect(page.getByTestId("focus-clock")).toHaveText("00:25:00");
    await page.getByRole("button", { name: "Empezar" }).click();
    await expect(page.getByTestId("focus-phase")).toHaveText("Trabajando");
    await expect.poll(running).toBe(taskId);

    await page.clock.fastForward("25:01");
    await expect(page.getByTestId("focus-phase")).toHaveText("Descanso");
    await expect.poll(running).toBeNull();
    const afterWork = await entries();
    expect(afterWork).toHaveLength(1);
    expect(afterWork[0]).toMatchObject({ focusMode: "pomodoro" });

    // Fuera de la pantalla de foco, la barra lateral sigue la sesion.
    await page.getByRole("button", { name: "Volver" }).click();
    const indicator = page.getByTestId("focus-indicator");
    await expect(indicator).toContainText("Descanso");
    await page.clock.fastForward("05:00");
    await expect(indicator).toContainText("Descanso terminado");
    // El descanso no registro nada.
    expect(await entries()).toHaveLength(1);

    await indicator.click();
    await page.getByRole("button", { name: "Siguiente bloque" }).click();
    await expect.poll(running).toBe(taskId);

    // Otro dispositivo para el cronometro: la sesion de foco se acaba aqui.
    await riuna.api("post", "/api/time-entry/stop", {});
    await page.clock.fastForward("00:20");
    await expect(
      page.getByText("El cronómetro se paró fuera del modo foco"),
    ).toBeVisible();
    await expect(page.getByTestId("focus-phase")).toHaveText(
      "Listo para concentrarte",
    );

    const today = await riuna.api<{ totals: { focusSessions: number } }>(
      "get",
      `/api/today?workspaceId=${riuna.workspaceId}`,
    );
    expect(today.totals.focusSessions).toBe(2);
  });

  // Revision de codigo del interludio, hallazgo 2: el bloque se cerraba
  // cuando el navegador lo comprobaba, no a su hora. Con el portatil
  // suspendido, un pomodoro de 25 minutos registraba lo que durase la siesta.
  test("un bloque que se comprueba tarde se registra hasta su hora de fin", async ({
    page,
    riuna,
  }) => {
    const taskId = await createTask(riuna, "Revisar presupuesto");
    await riuna.api("put", `/api/task/assignee/${taskId}`, {
      userId: riuna.userId,
    });
    await riuna.api(
      "put",
      `/api/planner/${taskId}?workspaceId=${riuna.workspaceId}`,
      { plannedDate: keyOf(new Date()) },
    );

    await page.clock.install({ time: new Date() });
    await page.goto(
      `/dashboard/workspace/${riuna.workspaceId}/focus/${taskId}`,
    );
    await page.getByRole("button", { name: "Empezar" }).click({
      timeout: 30_000,
    });
    await expect(page.getByTestId("focus-phase")).toHaveText("Trabajando");
    await expect
      .poll(
        async () =>
          (
            await riuna.api<{ running: { task: { id: string } } | null }>(
              "get",
              `/api/time-entry/running?workspaceId=${riuna.workspaceId}`,
            )
          ).running?.task.id ?? null,
      )
      .toBe(taskId);

    // Cuarenta minutos de golpe: el aviso del final llega quince tarde.
    await page.clock.fastForward("40:00");
    await expect(page.getByTestId("focus-phase")).toHaveText("Descanso");
    await expect
      .poll(
        async () =>
          (await riuna.api<Entry[]>("get", `/api/time-entry/task/${taskId}`))[0]
            ?.duration ?? null,
      )
      .not.toBeNull();
    const [entry] = await riuna.api<Entry[]>(
      "get",
      `/api/time-entry/task/${taskId}`,
    );
    expect(entry.duration).toBeGreaterThan(25 * 60 - 30);
    expect(entry.duration).toBeLessThan(25 * 60 + 30);
  });
});
