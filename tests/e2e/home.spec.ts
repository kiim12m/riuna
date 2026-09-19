import { API_URL, createTask, expect, test } from "./fixtures";

/**
 * El panel personal: la pantalla que funde "Mi trabajo" y "Panel".
 *
 * Lo que ninguna prueba de API cubre: que la distribucion de partida se siembra
 * sola la primera vez, que la bandeja comparte estado con la campana, y que una
 * fila aparece y desaparece sin recargar cuando otra sesion reasigna.
 */
test.describe("Panel personal", () => {
  test("seeds the default layout on the first visit", async ({
    page,
    riuna,
  }) => {
    const taskId = await createTask(riuna, "Tarea asignada");
    await riuna.api("put", `/api/task/assignee/${taskId}`, {
      userId: riuna.userId,
    });

    await page.goto(`/dashboard/workspace/${riuna.workspaceId}/home`);

    // Un panel vacio no responde nada: quien entra por primera vez ve su
    // trabajo, no un boton de "anadir widget".
    await expect(
      page.getByRole("heading", { name: "Asignadas a mí" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "De mis equipos" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Bandeja" })).toBeVisible();

    // Acotado a su widget: el titulo tambien sale en el texto de la
    // notificacion de la bandeja, que es correcto y no una duplicidad.
    await expect(
      page
        .getByRole("region", { name: "Asignadas a mí" })
        .getByText("Tarea asignada"),
    ).toBeVisible();

    // Y se siembra una sola vez: recargar no duplica nada.
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Asignadas a mí" }),
    ).toHaveCount(1);
  });

  test("redirects the two routes it replaced", async ({ page, riuna }) => {
    // Los enlaces guardados de quien ya usaba las pantallas viejas siguen
    // llegando a la que responde la misma pregunta.
    for (const old of ["my-work", "panel"]) {
      await page.goto(`/dashboard/workspace/${riuna.workspaceId}/${old}`);
      await expect(page).toHaveURL(
        new RegExp(`/dashboard/workspace/${riuna.workspaceId}/home$`),
      );
    }
  });

  // La bandeja y la campana son **la misma consulta**: marcar leido en una
  // tiene que apagar el contador de la otra sin recargar. Crear el espacio ya
  // deja una notificacion, asi que hay material.
  test("shares the inbox state with the bell", async ({ page, riuna }) => {
    await page.goto(`/dashboard/workspace/${riuna.workspaceId}/home`);

    const bell = page.getByRole("button", { name: /Notificaciones/ });
    await expect(bell).toContainText("1");

    // El de la bandeja, no el de la campana: los dos existen y hacen lo mismo.
    await page
      .getByRole("region", { name: "Bandeja" })
      .getByRole("button", { name: "Marcar todos como leídos" })
      .click();

    // El contador de la campana se apaga solo: comparten la clave de consulta.
    await expect(bell).not.toContainText("1");
  });

  // El gesto que menos cubre la automatizacion de API: la fila aparece y
  // desaparece sola, sin recargar, por un cambio hecho desde otra sesion. El
  // panel se refresca por intervalo de 60 s, pero **la pertenencia se empuja**
  // por el canal de usuario, asi que esto no puede tardar un minuto.
  test("adds and removes a row live when another session assigns it", async ({
    page,
    riuna,
    browser,
  }) => {
    const taskId = await createTask(riuna, "Llega sola");

    await page.goto(`/dashboard/workspace/${riuna.workspaceId}/home`);
    const asignadas = page.getByRole("region", { name: "Asignadas a mí" });
    await expect(asignadas.getByText("Llega sola")).toHaveCount(0);

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
    await expect(asignadas.getByText("Llega sola")).toBeVisible();

    await assign(null);
    await expect(asignadas.getByText("Llega sola")).toHaveCount(0);

    await other.close();
  });
});
