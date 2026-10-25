import { createTask, expect, test } from "./fixtures";

/**
 * Auditoria 1.1: arrastrar en el tablero mandaba un PUT completo por cada
 * tarea de la columna, con la foto que tenia el navegador, y pisaba lo que
 * otra persona hubiera editado mientras tanto en las vecinas.
 */
test("arrastrar una tarea no pisa lo que otra persona editó en sus vecinas", async ({
  page,
  riuna,
}) => {
  const movedId = await createTask(riuna, "Arrastrada");
  const neighbourId = await createTask(riuna, "Vecina");
  await createTask(riuna, "Otra vecina");

  // Sin WebSocket el tablero no se entera de la edicion de mas abajo: es la
  // foto vieja de quien lleva un rato con el tablero abierto.
  await page.routeWebSocket(/\/ws\//, () => {});

  await page.goto(
    `/dashboard/workspace/${riuna.workspaceId}/project/${riuna.projectId}/board`,
  );
  const card = page.getByText("Arrastrada", { exact: true });
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Vecina", { exact: true })).toBeVisible();

  await riuna.api("put", `/api/task/title/${neighbourId}`, {
    title: "Vecina editada",
  });

  // Lo que el arrastre deja en vuelo contra la API de tareas.
  const inFlight = new Set<object>();
  page.on("request", (request) => {
    if (request.url().includes("/api/task")) inFlight.add(request);
  });
  for (const done of ["requestfinished", "requestfailed"] as const) {
    page.on(done, (request) => inFlight.delete(request));
  }

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
        `/api/task/${movedId}`,
      );
      return task.status;
    })
    .toBe("in-progress");
  await expect.poll(() => inFlight.size).toBe(0);

  const neighbour = await riuna.api<{ title: string }>(
    "get",
    `/api/task/${neighbourId}`,
  );
  expect(neighbour.title).toBe("Vecina editada");
});
