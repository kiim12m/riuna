import { createTask, expect, test } from "./fixtures";

/**
 * "Hoy": la pantalla de entrada del espacio, y la primera pieza del
 * interludio de espacio personal y administracion que consume
 * `GET /api/my-work/tasks/search` (ADR 037) desde el navegador.
 */
test.describe("Hoy", () => {
  test("es la raiz del espacio y agrupa por ventana de vencimiento", async ({
    page,
    riuna,
  }) => {
    const dia = (n: number) =>
      new Date(Date.now() + n * 86_400_000).toISOString();

    const overdueId = await createTask(riuna, "Revisar factura", {
      dueDate: dia(-3),
    });
    const todayId = await createTask(riuna, "Enviar informe", {
      dueDate: dia(0),
    });
    for (const id of [overdueId, todayId]) {
      await riuna.api("put", `/api/task/assignee/${id}`, {
        userId: riuna.userId,
      });
    }

    // La raiz del espacio ya no cae en la tabla de proyectos ni en el panel:
    // cae en Hoy.
    await page.goto(`/dashboard/workspace/${riuna.workspaceId}`);
    await expect(page).toHaveURL(
      new RegExp(`/dashboard/workspace/${riuna.workspaceId}/today$`),
    );

    // Primera entrada del grupo "Espacio personal".
    await expect(page.getByRole("button", { name: "Hoy" })).toBeVisible();

    await expect(page.getByRole("heading", { name: "Vencidas" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Hoy" })).toBeVisible();
    await expect(page.getByText("Revisar factura")).toBeVisible();
    await expect(page.getByText("Enviar informe")).toBeVisible();

    // Abrir una fila enseña el detalle en el panel lateral, sin navegar a otra
    // pagina: la tarea es de un proyecto que la URL de "Hoy" no nombra. Sale
    // dos veces en la ficha (cabecera y lateral de propiedades), asi que basta
    // con la primera.
    await page.getByText("Revisar factura").click();
    await expect(
      page.getByText(new RegExp(riuna.projectSlug)).first(),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/today$/);
  });

  test("sin tareas asignadas se ve el estado vacio", async ({
    page,
    riuna,
  }) => {
    await page.goto(`/dashboard/workspace/${riuna.workspaceId}/today`);

    await expect(page.getByText("Nada pendiente")).toBeVisible();
  });
});
