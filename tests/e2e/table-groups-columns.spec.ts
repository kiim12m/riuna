import { createTask, expect, test } from "./fixtures";

/**
 * La vista Tabla: agrupar por épica, elegir las columnas y los totales de la
 * rama como columnas ordenables, y que la vista guardada lo recuerde. Era lo que
 * le faltaba al criterio de aceptación de la Fase 4.
 */
test.describe("Vista Tabla: grupos y columnas", () => {
  async function seed(riuna: Parameters<typeof createTask>[0]) {
    await riuna.api("post", `/api/field/project/${riuna.projectId}`, {
      name: "Presupuesto",
      type: "currency",
      config: { currency: "EUR" },
    });
    const epic = async (name: string) =>
      (
        await riuna.api<{ id: string }>(
          "post",
          `/api/epic/project/${riuna.projectId}`,
          { name },
        )
      ).id;
    const fase1 = await epic("Fase 1");
    const fase2 = await epic("Fase 2");

    const obra = await createTask(riuna, "Obra");
    const cimientos = await createTask(riuna, "Cimientos", { parentId: obra });
    const acopio = await createTask(riuna, "Acopio");
    await createTask(riuna, "Suelta");

    await riuna.api("put", `/api/epic/task/${obra}`, { epicIds: [fase1] });
    await riuna.api("put", `/api/epic/task/${acopio}`, {
      epicIds: [fase1, fase2],
    });
    for (const [id, presupuesto] of [
      [obra, 1000],
      [cimientos, 250],
      // Una suma negativa: con un -1 de relleno se mezclaba con las vacias.
      [acopio, -500],
    ] as const) {
      await riuna.api("put", `/api/task/custom-fields/${id}`, {
        values: { presupuesto },
      });
    }
  }

  const tableUrl = (riuna: { workspaceId: string; projectId: string }) =>
    `/dashboard/workspace/${riuna.workspaceId}/project/${riuna.projectId}/table`;

  test("agrupa por épica: una tarea con dos épicas sale en las dos, y lo demás al final", async ({
    page,
    riuna,
  }) => {
    await seed(riuna);
    await page.goto(tableUrl(riuna));
    await expect(page.getByText("Obra").first()).toBeVisible({
      timeout: 30_000,
    });

    await page.getByRole("combobox", { name: "Agrupar por" }).click();
    await page.getByRole("option", { name: "Épica" }).click();

    const groups = page.locator('[data-testid^="group-"]');
    await expect(groups).toHaveText([
      /Fase 1\s*2/,
      /Fase 2\s*1/,
      /Sin épica\s*1/,
    ]);
    // «Acopio» tiene las dos épicas: aparece en cada una.
    await expect(page.getByRole("button", { name: "Acopio" })).toHaveCount(2);

    // Plegar un grupo esconde sus filas y no las de los demás.
    await page.getByTestId("group-none").click();
    await expect(page.getByRole("button", { name: "Suelta" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Obra" })).toBeVisible();
  });

  test("muestra los totales de la rama como columnas, y los ordena", async ({
    page,
    riuna,
  }) => {
    await seed(riuna);
    await page.goto(tableUrl(riuna));
    await expect(page.getByText("Obra").first()).toBeVisible({
      timeout: 30_000,
    });
    // Apagadas de partida: la tabla de siempre no cambia.
    await expect(
      page.getByRole("columnheader", { name: "Presupuesto de la rama" }),
    ).toHaveCount(0);

    await page.getByRole("button", { name: "Columnas" }).click();
    await page
      .getByRole("menuitemcheckbox", { name: "Presupuesto de la rama" })
      .click();
    await page
      .getByRole("menuitemcheckbox", { name: "Progreso de la rama" })
      .click();
    await page.keyboard.press("Escape");

    const header = page.getByRole("columnheader", {
      name: "Presupuesto de la rama",
    });
    await expect(header).toBeVisible();
    await expect(page).toHaveURL(/columns=/);

    // «Obra» suma su rama: 1000 + 250.
    const obra = page.getByRole("row").filter({ hasText: "Obra" }).first();
    await expect(obra).toContainText(/1\.?250/);

    // Una columna numerica ordena primero de mayor a menor: «Obra», con 1250,
    // sube a la cabeza; la segunda pulsacion invierte el orden. Las que no
    // tienen valor van al final en los dos sentidos.
    await header.getByRole("button").click();
    await expect(page.getByRole("row").nth(1)).toContainText("Obra");
    await expect(page.getByRole("row").last()).toContainText("Suelta");
    await header.getByRole("button").click();
    await expect(page.getByRole("row").nth(1)).toContainText("Acopio");
    await expect(page.getByRole("row").nth(2)).toContainText("Obra");
    await expect(page.getByRole("row").last()).toContainText("Suelta");
  });

  test("la vista guardada recuerda el grupo y las columnas", async ({
    page,
    riuna,
  }) => {
    await seed(riuna);
    await page.goto(tableUrl(riuna));
    await expect(page.getByText("Obra").first()).toBeVisible({
      timeout: 30_000,
    });

    await page.getByRole("combobox", { name: "Agrupar por" }).click();
    await page.getByRole("option", { name: "Épica" }).click();
    await page.getByRole("button", { name: "Columnas" }).click();
    await page
      .getByRole("menuitemcheckbox", { name: "Progreso de la rama" })
      .click();
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Vistas" }).click();
    await page.getByRole("menuitem", { name: "Guardar esta vista" }).click();
    await page.getByRole("dialog").getByRole("textbox").fill("Por épica");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Guardar" })
      .click();
    await expect(page.getByText("Vista guardada")).toBeVisible();

    // Otra visita, sin nada en la URL: cargar la vista lo trae todo.
    await page.goto(tableUrl(riuna));
    await expect(page.locator('[data-testid^="group-"]')).toHaveCount(0);
    await page.getByRole("button", { name: "Vistas" }).click();
    await page.getByRole("menuitem", { name: "Por épica" }).click();

    await expect(page.locator('[data-testid^="group-"]')).toHaveCount(3);
    await expect(
      page.getByRole("columnheader", { name: "Progreso de la rama" }),
    ).toBeVisible();
  });
});
