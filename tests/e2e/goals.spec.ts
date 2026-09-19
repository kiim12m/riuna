import { createTask, expect, test } from "./fixtures";

/**
 * Objetivos y su widget. Fase 7, rebanadas 3 y 2.
 *
 * Lo que ninguna prueba de API cubre: que el objetivo se monta desde la
 * pantalla, que la cifra **avanza sola al cerrar una tarea** —el criterio de
 * aceptacion de la fase— y que el widget del panel enseña la misma cifra que
 * la pantalla de objetivos, que es lo que garantiza no tener dos verdades.
 */
test.describe("Objetivos", () => {
  test("advances on its own when a task is closed", async ({ page, riuna }) => {
    const taskId = await createTask(riuna, "Cerrar esta");
    await riuna.api("put", `/api/task/assignee/${taskId}`, {
      userId: riuna.userId,
    });

    await page.goto(`/dashboard/workspace/${riuna.workspaceId}/goals`);

    await page.getByRole("button", { name: "Nuevo objetivo" }).first().click();
    await page.getByLabel("Nombre").fill("Trimestre");
    await page.getByRole("button", { name: "Guardar" }).click();

    const tarjeta = page.getByRole("heading", { name: "Trimestre" });
    await expect(tarjeta).toBeVisible();

    // Sin resultados clave no hay nada que medir, y la pantalla lo dice.
    await expect(
      page.getByText("Sin resultados clave todavía", { exact: false }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Acciones del objetivo" }).click();
    await page
      .getByRole("menuitem", { name: "Añadir resultado clave" })
      .click();

    await page.getByLabel("Nombre").fill("Cerrar tareas");
    await page.getByLabel("Diana").fill("2");
    await page.getByRole("button", { name: "Guardar" }).click();

    // Nada cerrado todavia.
    await expect(page.getByText("0 de 2")).toBeVisible();

    // Se cierra por API, desde fuera de la pantalla: lo que se comprueba es que
    // la cifra se mueve **sin tocar nada**, no que un boton la mueva.
    await riuna.api("put", `/api/task/status/${taskId}`, { status: "done" });

    await page.reload();
    await expect(page.getByText("1 de 2")).toBeVisible();
  });

  test("shows the same figure on the panel as on the goals page", async ({
    page,
    riuna,
  }) => {
    await page.goto(`/dashboard/workspace/${riuna.workspaceId}/goals`);

    await page.getByRole("button", { name: "Nuevo objetivo" }).first().click();
    await page.getByLabel("Nombre").fill("Compartible");
    await page.getByRole("button", { name: "Guardar" }).click();

    await page.getByRole("button", { name: "Acciones del objetivo" }).click();
    await page
      .getByRole("menuitem", { name: "Añadir resultado clave" })
      .click();
    await page.getByLabel("Nombre").fill("Una diana");
    await page.getByLabel("Diana").fill("5");
    await page.getByRole("button", { name: "Guardar" }).click();

    await expect(page.getByText("0 de 5")).toBeVisible();

    // El mismo objetivo, ahora como widget del panel.
    await page.goto(`/dashboard/workspace/${riuna.workspaceId}/home`);
    await page.getByRole("button", { name: "Añadir widget" }).click();

    await page.getByLabel("Tipo").click();
    await page.getByRole("option", { name: "Objetivo" }).click();
    await page.getByLabel("Título").fill("Mi OKR");
    await page.getByLabel("Objetivo", { exact: true }).click();
    await page.getByRole("option", { name: "Compartible" }).click();
    await page.getByRole("button", { name: "Guardar" }).click();

    // La misma cifra en las dos pantallas: el widget no recalcula, lee lo que
    // ya midio el modulo de objetivos.
    await expect(
      page.getByRole("region", { name: "Mi OKR" }).getByText("0 de 5"),
    ).toBeVisible();
  });
});
