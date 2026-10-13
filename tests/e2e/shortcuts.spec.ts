import { createTask, expect, test } from "./fixtures";

/**
 * Atajos y paleta (sub-bloque 0.4 del interludio de productividad): los
 * atajos del detalle estaban documentados y sin registrar, la paleta no
 * llevaba a ninguna pantalla personal, y su "Atajos de teclado" entraba en
 * una recursion de eventos sinteticos.
 */
test.describe("Atajos y paleta", () => {
  test("`p` en el detalle de una tarea abre su prioridad", async ({
    page,
    riuna,
  }) => {
    const taskId = await createTask(riuna, "Revisar presupuesto");
    await page.goto(
      `/dashboard/workspace/${riuna.workspaceId}/project/${riuna.projectId}/task/${taskId}`,
    );
    await expect(
      page.getByRole("heading", { name: "Revisar presupuesto" }),
    ).toBeVisible({ timeout: 30_000 });

    await page.locator("body").click({ position: { x: 5, y: 5 } });

    // Los atajos del detalle se registran cuando ya se sabe que se puede
    // editar, y los permisos pueden llegar despues que el titulo: en la
    // version de produccion del simulacro la tecla caia antes y se perdia. Se
    // repite hasta que el selector se abre; no tiene buscador, asi que otra
    // `p` con el abierto no escribe nada.
    const urgent = page.getByRole("button", { name: /Urgente/ });
    await expect(async () => {
      if (!(await urgent.isVisible())) await page.keyboard.press("p");
      await expect(urgent).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
  });

  test("la paleta lleva al Planificador", async ({ page, riuna }) => {
    await page.goto(`/dashboard/workspace/${riuna.workspaceId}/today`);
    await expect(page.getByText("Nada pendiente")).toBeVisible({
      timeout: 30_000,
    });

    await page.keyboard.press("Control+k");
    await page.keyboard.type("Planificador");
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(/\/planner$/);
  });

  test("«Atajos de teclado» desde la paleta abre la ayuda sin errores", async ({
    page,
    riuna,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(String(error)));

    await page.goto(`/dashboard/workspace/${riuna.workspaceId}/today`);
    await expect(page.getByText("Nada pendiente")).toBeVisible({
      timeout: 30_000,
    });

    await page.keyboard.press("Control+k");
    await page.keyboard.type("Atajos de teclado");
    await page.keyboard.press("Enter");

    await expect(
      page.getByRole("heading", { name: "Atajos de teclado" }),
    ).toBeVisible();
    // Antes: cuatro "RangeError: Maximum call stack size exceeded". La
    // recursion es sincrona al pulsar Enter, asi que ya habria saltado.
    expect(errors).toEqual([]);
    await expect(page.getByText("Iniciar o parar el cronómetro")).toBeVisible();
  });
});
