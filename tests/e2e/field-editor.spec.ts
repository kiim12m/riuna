import { expect, test } from "./fixtures";

type Listed = {
  id: string;
  name: string;
  position: number;
  archivedAt: string | null;
};

/**
 * El editor de campos personalizados: renombrar, ordenar, archivar y borrar
 * existian en la API y no en la interfaz; los campos de espacio solo se podian
 * crear llamando a la API.
 */
test.describe("Editor de campos personalizados", () => {
  test("renombra, ordena, archiva, restaura y borra un campo del proyecto", async ({
    page,
    riuna,
  }) => {
    for (const name of ["Presupuesto", "Cliente"]) {
      await riuna.api("post", `/api/field/project/${riuna.projectId}`, {
        name,
        type: "text",
      });
    }
    const listed = () =>
      riuna.api<Listed[]>(
        "get",
        `/api/field/project/${riuna.projectId}?includeArchived=true`,
      );

    await page.goto(
      `/dashboard/workspace/${riuna.workspaceId}/admin/project-settings/${riuna.projectId}/workflow`,
    );
    const list = page.getByTestId("field-list");
    const row = (name: string) =>
      list.getByRole("listitem").filter({ hasText: name });
    await expect(row("Cliente")).toBeVisible({ timeout: 30_000 });

    // Renombrar: la clave no cambia, solo el nombre.
    await row("Cliente").getByRole("button", { name: "Renombrar" }).click();
    await page.getByRole("textbox", { name: "Renombrar" }).fill("Comprador");
    await page.keyboard.press("Enter");
    await expect(row("Comprador")).toBeVisible();
    expect((await listed()).map((field) => field.name).sort()).toEqual([
      "Comprador",
      "Presupuesto",
    ]);

    // Ordenar: subir el segundo al primer puesto.
    const before = (await listed()).sort((a, b) => a.position - b.position);
    await list
      .getByRole("listitem")
      .nth(1)
      .getByRole("button", { name: "Subir" })
      .click();
    await expect
      .poll(async () =>
        (await listed())
          .sort((a, b) => a.position - b.position)
          .map((field) => field.name),
      )
      .toEqual([before[1]?.name, before[0]?.name]);

    // Archivar y restaurar: no se pierde nada.
    await row("Comprador").getByRole("button", { name: "Archivar" }).click();
    await expect(row("Comprador").getByText("Archivado")).toBeVisible();
    await row("Comprador").getByRole("button", { name: "Restaurar" }).click();
    await expect(row("Comprador").getByText("Archivado")).toHaveCount(0);

    // Borrar pide confirmacion y avisa de que se pierden los valores.
    await row("Presupuesto").getByRole("button", { name: "Borrar" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText(
      "los valores que cada tarea tiene guardados",
    );
    await dialog.getByRole("button", { name: "Borrar" }).click();
    await expect(row("Presupuesto")).toHaveCount(0);
    expect((await listed()).map((field) => field.name)).toEqual(["Comprador"]);
  });

  test("crea un campo del espacio desde sus ajustes", async ({
    page,
    riuna,
  }) => {
    await page.goto(
      `/dashboard/workspace/${riuna.workspaceId}/admin/workspace/fields`,
    );
    await page
      .getByRole("button", { name: "Añadir un campo" })
      .click({ timeout: 30_000 });
    await page.getByLabel("Nombre").fill("Zona");
    await page.getByRole("button", { name: "Crear campo" }).click();

    await expect(
      page.getByTestId("field-list").getByText("Zona"),
    ).toBeVisible();
    const listed = await riuna.api<Listed[]>(
      "get",
      `/api/field/workspace/${riuna.workspaceId}`,
    );
    expect(listed.map((field) => field.name)).toEqual(["Zona"]);
  });
});
