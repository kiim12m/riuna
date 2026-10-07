// `exceljs` es dependencia de la API, no de la raiz: la prueba lo toma de alli
// para fabricar una hoja como la que se llevaba a mano.
import ExcelJS from "../../apps/api/node_modules/exceljs/excel.js";
import { expect, test } from "./fixtures";

async function handMadeSheet(projectName: string) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Full1");
  sheet.addRow([null, "TAREAS"]);
  sheet.addRow([
    "Fecha",
    "FECHA",
    "CONCEPTO",
    "PROYECTO",
    "Estado",
    "Comentario",
  ]);
  sheet.addRow([
    new Date(Date.UTC(2026, 4, 29)),
    null,
    "Revisar tierra",
    projectName,
    "En curso",
    "03/06/2026 — Pedir medidas",
  ]);
  sheet.addRow([
    new Date(Date.UTC(2026, 7, 17)),
    null,
    "Enviar fotos",
    "Bauhaus Torrevieja",
    "Pendiente",
    null,
  ]);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/**
 * La hoja de SERVITEC de vuelta (Fase 8, Bloque 4): subirla, decidir que hacer
 * con un proyecto que no existe, comprobar sin escribir e importar.
 */
test("importa la hoja de SERVITEC creando el proyecto que falta", async ({
  page,
  riuna,
}) => {
  const project = await riuna.api<{ name: string }>(
    "get",
    `/api/project/${riuna.projectId}`,
  );

  await page.goto(
    `/dashboard/workspace/${riuna.workspaceId}/admin/workspace/general`,
  );
  await page
    .getByTestId("servitec-import-row")
    .getByRole("button", { name: "Importar" })
    .click({ timeout: 30_000 });

  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Hoja (.xlsx)").setInputFiles({
    name: "cuadro.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: await handMadeSheet(project.name),
  });

  const analysis = dialog.getByTestId("servitec-analysis");
  await expect(analysis).toContainText("2 filas");
  await expect(
    analysis.getByRole("combobox", { name: /«Bauhaus Torrevieja» no existe/ }),
  ).toContainText("Crear el proyecto «Bauhaus Torrevieja»");

  await dialog.getByRole("button", { name: "Comprobar" }).click();
  const report = dialog.getByTestId("servitec-report");
  await expect(report).toContainText("Si la importas:");
  await expect(report).toContainText("1 tarea creada");
  await expect(report).toContainText(
    "1 tarea en el proyecto nuevo «Bauhaus Torrevieja»",
  );

  await dialog.getByRole("button", { name: "Importar", exact: true }).click();
  await expect(report).toContainText("Importada:");
  await expect(report).toContainText("2 tareas creadas");

  const projects = await riuna.api<Array<{ id: string; name: string }>>(
    "get",
    `/api/project?workspaceId=${riuna.workspaceId}`,
  );
  expect(projects.map((item) => item.name)).toContain("Bauhaus Torrevieja");
});
