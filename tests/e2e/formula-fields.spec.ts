import { createTask, expect, test } from "./fixtures";

type Listed = {
  key: string;
  type: string;
  description: string | null;
  config: Record<string, unknown>;
};

/**
 * Campos calculados y textos de ayuda (ADR 090): se definen en los ajustes con
 * nombres, se guardan con claves, y salen en la Tabla y en el detalle, sin
 * poder editarse, con su ayuda y su formula.
 */
test("un campo calculado se define con nombres y se ve en la Tabla y en el detalle", async ({
  page,
  riuna,
}) => {
  for (const [name, type, config] of [
    ["Presupuesto", "currency", { currency: "EUR" }],
    ["Horas previstas", "number", {}],
  ] as const) {
    await riuna.api("post", `/api/field/project/${riuna.projectId}`, {
      name,
      type,
      config,
    });
  }
  const taskId = await createTask(riuna, "Instalación eléctrica");
  await riuna.api("put", `/api/task/custom-fields/${taskId}`, {
    values: { presupuesto: 18400, horas_previstas: 64 },
  });

  await page.goto(
    `/dashboard/workspace/${riuna.workspaceId}/admin/project-settings/${riuna.projectId}/workflow`,
  );
  await page
    .getByRole("button", { name: "Añadir un campo" })
    .click({ timeout: 30_000 });
  const dialog = page.getByRole("dialog", {
    name: "Campo personalizado nuevo",
  });
  await dialog.getByRole("textbox", { name: "Nombre" }).fill("Coste por hora");
  await dialog.getByLabel("Tipo").click();
  await page.getByRole("option", { name: "Calculado" }).click();

  // Los botones meten el nombre entre llaves donde esta el cursor.
  await dialog.getByRole("button", { name: "Presupuesto" }).click();
  await dialog.getByRole("textbox", { name: "Fórmula" }).press("End");
  await dialog
    .getByRole("textbox", { name: "Fórmula" })
    .pressSequentially(" ÷ ");
  await dialog.getByRole("button", { name: "Horas previstas" }).click();
  await expect(dialog.getByRole("textbox", { name: "Fórmula" })).toHaveValue(
    "{Presupuesto} ÷ {Horas previstas}",
  );
  await dialog.getByLabel("Mostrar como").click();
  await page.getByRole("option", { name: "Moneda" }).click();
  await dialog
    .getByRole("textbox", { name: "Texto de ayuda" })
    .fill("Lo que sale cada hora prevista");
  await dialog.getByRole("button", { name: "Crear campo" }).click();
  await expect(dialog).toBeHidden();

  const fields = await riuna.api<Listed[]>(
    "get",
    `/api/field/project/${riuna.projectId}`,
  );
  expect(fields.find((field) => field.type === "formula")).toMatchObject({
    key: "coste_por_hora",
    description: "Lo que sale cada hora prevista",
    config: {
      expression: "{presupuesto} / {horas_previstas}",
      format: "currency",
      currency: "EUR",
    },
  });

  await page.goto(
    `/dashboard/workspace/${riuna.workspaceId}/project/${riuna.projectId}/table`,
  );
  const header = page.getByRole("columnheader", { name: /Coste por hora/ });
  await expect(header).toContainText("ƒ", { timeout: 30_000 });
  const row = page
    .getByRole("row")
    .filter({ hasText: "Instalación eléctrica" });
  await expect(row.getByTestId("formula-value")).toHaveText(/287,50\s?€/);

  // La ayuda dice que significa y como se calcula. La burbuja tarda en abrirse
  // y un repintado de la Tabla la cierra: se vuelve a pasar el raton.
  const help = header.getByRole("button", { name: "Sobre Coste por hora" });
  await expect(async () => {
    await help.hover();
    await expect(page.getByText("Lo que sale cada hora prevista")).toBeVisible({
      timeout: 2_000,
    });
  }).toPass({ timeout: 20_000 });
  await expect(
    page.getByText("Se calcula: Presupuesto ÷ Horas previstas"),
  ).toBeVisible();

  // En el detalle, el valor con su formula debajo y sin editor.
  await page.goto(
    `/dashboard/workspace/${riuna.workspaceId}/project/${riuna.projectId}/board?taskId=${taskId}`,
  );
  const fieldsBlock = page
    .getByTestId("task-custom-fields")
    .filter({ visible: true })
    .first();
  await expect(fieldsBlock.getByTestId("formula-value")).toHaveText(
    /287,50\s?€/,
    { timeout: 30_000 },
  );
  await expect(
    fieldsBlock.getByText("ƒ Presupuesto ÷ Horas previstas"),
  ).toBeVisible();

  // Cambiar un dato que lee la recalcula.
  await riuna.api("put", `/api/task/custom-fields/${taskId}`, {
    values: { horas_previstas: 80 },
  });
  await page.reload();
  await expect(
    page
      .getByTestId("task-custom-fields")
      .filter({ visible: true })
      .first()
      .getByTestId("formula-value"),
  ).toHaveText(/230,00\s?€/, { timeout: 30_000 });
});
