import { createTask, expect, test } from "./fixtures";

/** Rebanadas 3 y 4: las dos viven en los ajustes de flujo del proyecto. */
test.describe("Recurrentes y plantillas", () => {
  test("creates a weekly recurrence and pauses it", async ({ page, riuna }) => {
    await page.goto(`/dashboard/settings/projects/${riuna.projectId}/workflow`);

    await expect(
      page.getByRole("heading", { name: "Tareas recurrentes" }),
    ).toBeVisible();

    await page.getByLabel("Título de la tarea").fill("Parte semanal");

    // Los dias de la semana son botones conmutables; lunes viene marcado.
    await page.getByRole("button", { name: "Mié", exact: true }).click();

    await page.getByRole("button", { name: "Añadir tarea recurrente" }).click();

    // El resumen legible de la cadencia es lo que la lista tiene que enseñar.
    await expect(page.getByText("Parte semanal")).toBeVisible();
    await expect(page.getByText(/Cada semana · Lun, Mié/)).toBeVisible();
    await expect(page.getByText(/0 tareas creadas/)).toBeVisible();

    await page.getByRole("button", { name: "Pausar" }).click();
    await expect(page.getByRole("button", { name: "Reanudar" })).toBeVisible();
  });

  // Lo que da nombre a la rebanada: la plantilla despliega su jerarquia.
  test("saves a project as a template and deploys it back", async ({
    page,
    riuna,
  }) => {
    const root = await createTask(riuna, "Lanzamiento");
    await createTask(riuna, "Preparar copia", { parentId: root });

    await page.goto(`/dashboard/settings/projects/${riuna.projectId}/workflow`);

    await expect(
      page.getByRole("heading", { name: "Plantillas" }),
    ).toBeVisible();

    await page
      .getByPlaceholder("Nombre de la nueva plantilla")
      .fill("Plantilla de lanzamiento");
    await page
      .getByRole("button", { name: "Guardar este proyecto como plantilla" })
      .click();

    await expect(page.getByText("Plantilla de lanzamiento")).toBeVisible();
    await expect(page.getByText("2 tareas")).toBeVisible();

    await page.getByRole("button", { name: "Usar" }).click();

    // El aviso dice cuantas ha creado; es la unica confirmacion de que el
    // despliegue ha ocurrido de verdad.
    await expect(page.getByText("2 tareas creadas")).toBeVisible();

    // Y el arbol llega entero: cuatro tareas, dos de ellas hijas.
    const board = await riuna.api<{
      data: {
        columns: Array<{
          tasks: Array<{ id: string; title: string; parentId: string | null }>;
        }>;
      };
    }>("get", `/api/task/tasks/${riuna.projectId}`);
    const flat = board.data.columns.flatMap((column) => column.tasks);

    expect(flat).toHaveLength(4);
    expect(flat.filter((task) => task.title === "Lanzamiento")).toHaveLength(2);
    expect(
      flat.filter((task) => task.title === "Preparar copia" && task.parentId),
    ).toHaveLength(2);
  });
});
