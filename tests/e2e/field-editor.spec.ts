import { expect, test } from "./fixtures";

type Listed = {
  id: string;
  name: string;
  position: number;
  archivedAt: string | null;
  description: string | null;
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

    // Editar: el nombre y la ayuda cambian; la clave no (ADR 090).
    await row("Cliente").getByRole("button", { name: "Editar" }).click();
    const editor = page.getByRole("dialog", { name: "Editar el campo" });
    await editor.getByRole("textbox", { name: "Nombre" }).fill("Comprador");
    await editor
      .getByRole("textbox", { name: "Texto de ayuda" })
      .fill("Quien paga la obra");
    await editor.getByRole("button", { name: "Guardar el campo" }).click();
    await expect(editor).toBeHidden();
    await expect(row("Comprador")).toBeVisible();
    expect(
      (await listed())
        .map((field) => `${field.name}:${field.description ?? ""}`)
        .sort(),
    ).toEqual(["Comprador:Quien paga la obra", "Presupuesto:"]);

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

  test("en un proyecto, las flechas ordenan sus campos y saltan los del espacio", async ({
    page,
    riuna,
  }) => {
    const create = (path: string, name: string) =>
      riuna.api<{ id: string }>("post", path, { name, type: "text" });
    const alfa = await create(
      `/api/field/workspace/${riuna.workspaceId}`,
      "Alfa",
    );
    const beta = await create(`/api/field/project/${riuna.projectId}`, "Beta");
    await create(`/api/field/project/${riuna.projectId}`, "Gamma");
    // Un campo del espacio y uno del proyecto con la misma posicion: cada uno
    // cuenta en su propia numeracion.
    for (const id of [alfa.id, beta.id]) {
      await riuna.api("patch", `/api/field/${id}`, { position: 0 });
    }

    await page.goto(
      `/dashboard/workspace/${riuna.workspaceId}/admin/project-settings/${riuna.projectId}/workflow`,
    );
    const list = page.getByTestId("field-list");
    const row = (name: string) =>
      list.getByRole("listitem").filter({ hasText: name });
    await expect(row("Gamma")).toBeVisible({ timeout: 30_000 });

    // Beta es el primero de los del proyecto: no tiene a quien adelantar.
    await expect(
      row("Beta").getByRole("button", { name: "Subir" }),
    ).toBeDisabled();

    await row("Gamma").getByRole("button", { name: "Subir" }).click();
    await expect
      .poll(async () =>
        (
          await riuna.api<Listed[]>(
            "get",
            `/api/field/project/${riuna.projectId}`,
          )
        )
          .filter((field) => field.name !== "Alfa")
          .sort((a, b) => a.position - b.position)
          .map((field) => field.name),
      )
      .toEqual(["Gamma", "Beta"]);
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
