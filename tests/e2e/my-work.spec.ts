import { API_URL, createTask, expect, test } from "./fixtures";

/**
 * Rebanada 1 de la Fase 6.
 *
 * Lo que ninguna prueba de API cubre: que la pagina se pinta, que las dos
 * secciones estan, que el filtro viaja por la URL y que la pestaña de bandeja
 * se abre y se recuerda al recargar.
 */
test.describe("Mi trabajo", () => {
  test("shows both sections and keeps the filter in the URL", async ({
    page,
    riuna,
  }) => {
    const taskId = await createTask(riuna, "Tarea asignada");
    await riuna.api("put", `/api/task/assignee/${taskId}`, {
      userId: riuna.userId,
    });

    await page.goto(`/dashboard/workspace/${riuna.workspaceId}/my-work`);

    // Las dos secciones, separadas: es la decision de producto de la rebanada.
    await expect(
      page.getByRole("heading", { name: "Asignadas a mí" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "De mis equipos" }),
    ).toBeVisible();

    await expect(page.getByText("Tarea asignada")).toBeVisible();

    // El equipo esta vacio y tiene su propio texto, no uno generico.
    await expect(
      page.getByText("Tus equipos no tienen nada pendiente"),
    ).toBeVisible();

    // El filtro cambia la URL, que es lo que hace que una vista sea un enlace.
    await page.getByRole("button", { name: "Vencidas" }).click();
    await expect(page).toHaveURL(/due=overdue/);

    await page.goBack();
    await expect(page).not.toHaveURL(/due=overdue/);
  });

  // La bandeja y la campana son **la misma consulta**, que es la decision de la
  // rebanada: marcar leido en una tiene que apagar el contador de la otra sin
  // recargar. Crear el espacio ya deja una notificacion, asi que hay material.
  test("shares its state with the bell and survives a reload", async ({
    page,
    riuna,
  }) => {
    await page.goto(`/dashboard/workspace/${riuna.workspaceId}/my-work`);

    const bell = page.getByRole("button", { name: /Notificaciones/ });
    await expect(bell).toContainText("1");

    await page.getByRole("tab", { name: "Bandeja" }).click();
    await expect(page).toHaveURL(/tab=inbox/);

    const inbox = page.getByRole("tabpanel", { name: "Bandeja" });
    // El aviso del tope de 50 es deuda declarada, y la pagina la dice en vez de
    // fingir que eso es todo lo que ha pasado.
    await expect(
      inbox.getByText("Se muestran las 50 más recientes"),
    ).toBeVisible();

    await inbox
      .getByRole("button", { name: "Marcar todos como leídos" })
      .click();

    // El contador de la campana se apaga solo: comparten la clave de consulta.
    await expect(bell).not.toContainText("1");

    // La pestaña vive en la URL, asi que recargar la conserva.
    await page.reload();
    await expect(page.getByRole("tab", { name: "Bandeja" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  // El gesto que menos cubre la automatizacion de API: la fila aparece y
  // desaparece sola, sin recargar, por un cambio hecho desde otra sesion.
  test("adds and removes a row live when another session assigns it", async ({
    page,
    riuna,
    browser,
  }) => {
    const taskId = await createTask(riuna, "Llega sola");

    await page.goto(`/dashboard/workspace/${riuna.workspaceId}/my-work`);
    await expect(page.getByText("No tienes nada asignado")).toBeVisible();

    // Otra sesion, otro navegador: el servidor no reenvia el evento a la
    // ventana que lo origino, asi que hacerlo desde la misma pestaña no
    // probaria nada.
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await otherPage.request.post(`${API_URL}/api/auth/sign-in/email`, {
      headers: {
        "content-type": "application/json",
        Origin: "http://localhost:5174",
      },
      data: { email: riuna.email, password: "E2e-passw0rd!" },
    });

    const assign = async (userId: string | null) => {
      const response = await otherPage.request.put(
        `${API_URL}/api/task/assignee/${taskId}`,
        {
          headers: {
            "content-type": "application/json",
            Origin: "http://localhost:5174",
          },
          data: { userId },
        },
      );
      expect(response.ok()).toBe(true);
    };

    await assign(riuna.userId);
    await expect(page.getByText("Llega sola")).toBeVisible({ timeout: 15_000 });

    // Y la mitad que faltaba: desasignar tiene que quitarla. Es el fallo que
    // los tres campos de carga util nuevos arreglan.
    await assign(null);
    await expect(page.getByText("Llega sola")).toBeHidden({ timeout: 15_000 });

    await other.close();
  });
});
