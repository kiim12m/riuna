import { expect, test } from "./fixtures";

const CSV = [
  "Referencia,Esquema,Título,Prioridad",
  "A1,1,Preparar la obra,Alta",
  "A2,1.1,Acopiar material,Media",
  "A3,2,Entregar al cliente,Baja",
].join("\n");

/**
 * El asistente de importacion de la Fase 5: fichero, mapeo, comprobar, importar.
 * La API estaba probada de punta a punta; el asistente web no se habia pasado
 * por un navegador. Y el criterio de la fase: reimportar no duplica.
 */
test("importa un fichero con jerarquía y al reimportarlo no duplica", async ({
  page,
  riuna,
}) => {
  const tasks = () =>
    riuna
      .api<{
        data: {
          columns: {
            tasks: { title: string; parentId: string | null; id: string }[];
          }[];
        };
      }>("get", `/api/task/tasks/${riuna.projectId}`)
      .then((body) => body.data.columns.flatMap((column) => column.tasks));

  const importFile = async () => {
    await page.goto(
      `/dashboard/workspace/${riuna.workspaceId}/admin/project-settings/${riuna.projectId}/general`,
    );
    await page
      .getByRole("button", { name: "Importar tareas" })
      .click({ timeout: 30_000 });
    await page.locator('input[type="file"]').setInputFiles({
      name: "obra.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(CSV, "utf8"),
    });
  };

  await importFile();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("3 filas: 0 ya existen y 3 son nuevas.");

  await dialog.getByRole("button", { name: "Comprobar" }).click();
  await expect(dialog).toContainText(
    "Se crearán 3, se actualizarán 0 y 0 tienen errores.",
  );
  // La comprobacion no crea nada.
  expect(await tasks()).toHaveLength(0);

  await dialog.getByRole("button", { name: "Importar tareas" }).click();
  await expect(
    page.getByText("3 tareas creadas y 0 actualizadas"),
  ).toBeVisible();

  const created = await tasks();
  expect(created.map((task) => task.title).sort()).toEqual([
    "Acopiar material",
    "Entregar al cliente",
    "Preparar la obra",
  ]);
  const parent = created.find((task) => task.title === "Preparar la obra");
  const child = created.find((task) => task.title === "Acopiar material");
  expect(child?.parentId).toBe(parent?.id);

  // El mismo fichero otra vez: actualiza, no duplica.
  await importFile();
  await expect(page.getByRole("dialog")).toContainText(
    "3 filas: 3 ya existen y 0 son nuevas.",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Importar tareas" })
    .click();
  await expect(
    page.getByText("0 tareas creadas y 3 actualizadas"),
  ).toBeVisible();
  expect(await tasks()).toHaveLength(3);
});
