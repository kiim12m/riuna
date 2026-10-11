import type { Locator } from "@playwright/test";
import { createTask, expect, test } from "../fixtures";

/**
 * Las pantallas que se consultan desde el móvil, a 390 px (Fase 9, Bloque 6):
 * Hoy, Mis tareas, el detalle de tarea, el Tablero y la Lista. Un gesto por
 * pantalla, y que el título se lea: antes se quedaba en una o dos palabras.
 */

const LONG = "Revisar el presupuesto de la reforma";
const today = () => new Date().toISOString().slice(0, 10);

// Que el texto no está cortado ni por los lados ni por abajo.
async function fullyShown(locator: Locator) {
  return locator.evaluate(
    (element) =>
      element.scrollWidth <= element.clientWidth + 1 &&
      element.scrollHeight <= element.clientHeight + 1,
  );
}

test.describe("En el móvil", () => {
  test("Hoy: el título se lee y la casilla la da por hecha", async ({
    page,
    riuna,
  }) => {
    const taskId = await createTask(riuna, LONG, {
      dueDate: new Date().toISOString(),
    });
    await riuna.api("put", `/api/task/assignee/${taskId}`, {
      userId: riuna.userId,
    });
    await riuna.api(
      "put",
      `/api/planner/${taskId}?workspaceId=${riuna.workspaceId}`,
      { plannedDate: today() },
    );

    await page.goto(`/dashboard/workspace/${riuna.workspaceId}/today`);
    const row = page.getByTestId(`today-row-${taskId}`);
    const title = row.getByText(LONG);
    await expect(title).toBeVisible({ timeout: 20_000 });
    expect(await fullyShown(title)).toBe(true);

    await row
      .getByRole("checkbox", { name: "Marcar tarea como hecha" })
      .click();
    await page.getByRole("button", { name: /Hechas hoy/ }).click();
    await expect(page.getByTestId(`today-row-${taskId}`)).toBeVisible();
  });

  test("Mis tareas: el título se lee y abre la tarea", async ({
    page,
    riuna,
  }) => {
    const taskId = await createTask(riuna, LONG, {
      dueDate: new Date(Date.now() + 2 * 86_400_000).toISOString(),
    });
    await riuna.api("put", `/api/task/assignee/${taskId}`, {
      userId: riuna.userId,
    });

    await page.goto(`/dashboard/workspace/${riuna.workspaceId}/my-tasks/list`);
    const title = page.getByText(LONG).first();
    await expect(title).toBeVisible({ timeout: 20_000 });
    expect(await fullyShown(title)).toBe(true);

    await title.click();
    await expect(page.getByRole("textbox", { name: LONG })).toBeVisible();
  });

  test("Detalle: el título entero, en varias líneas, y el estado se cambia", async ({
    page,
    riuna,
  }) => {
    const long = `${LONG} de la calle Mayor antes del viernes`;
    const taskId = await createTask(riuna, long);

    await page.goto(
      `/dashboard/workspace/${riuna.workspaceId}/project/${riuna.projectId}/task/${taskId}`,
    );
    const title = page.getByRole("textbox", { name: long });
    await expect(title).toBeVisible({ timeout: 20_000 });
    expect(await fullyShown(title)).toBe(true);
    const box = await title.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThan(60);

    // Con el build de produccion (el simulacro de restauracion) el primer
    // clic podia llegar antes de que el desplegable estuviera listo.
    const inProgress = page.getByRole("button", { name: "En curso" });
    await expect(async () => {
      if (!(await inProgress.isVisible())) {
        await page.getByRole("button", { name: "Por hacer" }).first().click();
      }
      await expect(inProgress).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 30_000 });
    await inProgress.click();
    await expect
      .poll(
        async () =>
          (await riuna.api<{ status: string }>("get", `/api/task/${taskId}`))
            .status,
      )
      .toBe("in-progress");
  });

  test("Tablero: una columna a lo ancho, y se mueve de columna desde el menú", async ({
    page,
    riuna,
  }) => {
    const taskId = await createTask(riuna, "Enviar factura");

    await page.goto(
      `/dashboard/workspace/${riuna.workspaceId}/project/${riuna.projectId}/board`,
    );
    const card = page.getByText("Enviar factura").first();
    await expect(card).toBeVisible({ timeout: 20_000 });

    await card.click({ button: "right" });
    await page.getByRole("menuitem", { name: "Estado" }).click();
    await page.getByRole("menuitemcheckbox", { name: "En curso" }).click();
    await expect
      .poll(
        async () =>
          (await riuna.api<{ status: string }>("get", `/api/task/${taskId}`))
            .status,
      )
      .toBe("in-progress");
  });

  test("Lista: el título se lee sin la clave delante", async ({
    page,
    riuna,
  }) => {
    await createTask(riuna, LONG);

    await page.goto(
      `/dashboard/workspace/${riuna.workspaceId}/project/${riuna.projectId}/board`,
    );
    await page.getByRole("button", { name: "Lista" }).click();
    const title = page.getByText(LONG).first();
    await expect(title).toBeVisible({ timeout: 20_000 });
    expect(await fullyShown(title)).toBe(true);
  });
});
