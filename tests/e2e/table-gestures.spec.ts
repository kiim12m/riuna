import { createTask, expect, test } from "./fixtures";

/**
 * Los tres gestos de la vista Tabla que la Fase 4 dejo sin probar en vivo —elegir
 * el tipo de un campo, editar un `multi_select` y cargar una vista del menu—
 * porque entonces se creia que los desplegables de Base UI no abrian en un
 * navegador sin cabeza. Abren: el humo de la Fase 6 lo demostro.
 */
test.describe("Vista Tabla: gestos de la Fase 4", () => {
  test("elige el tipo de un campo, edita una selección múltiple y carga una vista", async ({
    page,
    riuna,
  }) => {
    const taskId = await createTask(riuna, "Cuadro general", {
      priority: "high",
    });
    await createTask(riuna, "Replanteo", { priority: "low" });

    await page.goto(
      `/dashboard/workspace/${riuna.workspaceId}/project/${riuna.projectId}/table`,
    );

    // 1. Elegir el tipo de un campo.
    await page
      .getByRole("button", { name: "Añadir un campo" })
      .click({ timeout: 30_000 });
    await page.getByLabel("Nombre").fill("Fase");
    await page.getByRole("combobox").click();
    await page.getByRole("option", { name: "Selección múltiple" }).click();
    await page.getByLabel("Opciones").fill("Obra\nCarpa\nEntrega");
    await page.getByRole("button", { name: "Crear campo" }).click();
    await expect(
      page.getByRole("columnheader", { name: "Fase" }),
    ).toBeVisible();

    // 2. Editar un multi_select: un menu de casillas, no un campo de texto.
    const row = page.getByRole("row").filter({ hasText: "Cuadro general" });
    await row.getByRole("button", { name: "—" }).click();
    await page.getByRole("menuitemcheckbox", { name: "Obra" }).click();
    // El menu se cierra al elegir; la celda ya enseña la eleccion, y de ella
    // parte la siguiente, como haria quien lo hace a mano.
    await row.getByRole("button", { name: "Obra", exact: true }).click();
    await page.getByRole("menuitemcheckbox", { name: "Entrega" }).click();

    await expect
      .poll(async () => {
        const task = await riuna.api<{ customFields: Record<string, unknown> }>(
          "get",
          `/api/task/${taskId}`,
        );
        return task.customFields?.fase;
      })
      .toEqual(["obra", "entrega"]);

    // 3. Guardar una vista con un filtro y cargarla desde el menu.
    await page.getByRole("button", { name: "Añadir un filtro" }).click();
    await page.getByPlaceholder("Valor").fill("Cuadro general");
    await expect(page.getByRole("row")).toHaveCount(2); // cabecera + 1
    await expect(page.getByText("Replanteo")).toHaveCount(0);

    await page.getByRole("button", { name: "Vistas" }).click();
    await page.getByRole("menuitem", { name: "Guardar esta vista" }).click();
    await page.getByRole("dialog").getByRole("textbox").fill("Solo el cuadro");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Guardar" })
      .click();
    await expect(page.getByText("Vista guardada")).toBeVisible();

    // Sin filtro vuelven las dos; cargar la vista devuelve el filtro.
    await page
      .getByRole("button", { name: "Eliminar todos los filtros" })
      .click();
    await expect(page.getByText("Replanteo")).toBeVisible();

    await page.getByRole("button", { name: "Vistas" }).click();
    await page.getByRole("menuitem", { name: "Solo el cuadro" }).click();
    await expect(page.getByText("Replanteo")).toHaveCount(0);
    await expect(page.getByText("Cuadro general")).toBeVisible();
  });
});
