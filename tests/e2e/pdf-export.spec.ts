import { readFileSync } from "node:fs";
import type { Download } from "@playwright/test";
import { createTask, expect, test } from "./fixtures";

/** Que lo descargado es un PDF de verdad, no un error con otro nombre. */
async function expectPdf(download: Download, name: RegExp) {
  expect(download.suggestedFilename()).toMatch(name);
  const path = await download.path();
  expect(readFileSync(path).subarray(0, 5).toString()).toBe("%PDF-");
}

/**
 * Exportar a PDF (ADR 091) desde los tres sitios de la maqueta: el detalle de
 * una tarea, el menu de una vista y el parte de horas.
 */
test("descarga en PDF una tarea, una vista y el parte de horas", async ({
  page,
  riuna,
}) => {
  const taskId = await createTask(riuna, "Instalación eléctrica");
  await riuna.api("post", "/api/time-entry", {
    taskId,
    startTime: new Date(Date.now() - 2 * 3600_000).toISOString(),
    endTime: new Date(Date.now() - 3600_000).toISOString(),
  });

  // La tarea, desde sus acciones.
  await page.goto(
    `/dashboard/workspace/${riuna.workspaceId}/project/${riuna.projectId}/board?taskId=${taskId}`,
  );
  const button = page.getByTestId("task-export-pdf").filter({ visible: true });
  await expect(button.first()).toBeVisible({ timeout: 30_000 });
  const taskDownload = page.waitForEvent("download");
  await button.first().click();
  await expectPdf(await taskDownload, /-instalacion-electrica\.pdf$/);

  // La Tabla, con su filtro y sus columnas.
  await page.goto(
    `/dashboard/workspace/${riuna.workspaceId}/project/${riuna.projectId}/table`,
  );
  await expect(page.getByText("Instalación eléctrica").first()).toBeVisible({
    timeout: 30_000,
  });
  const viewDownload = page.waitForEvent("download");
  await page.getByTestId("export-menu").click();
  await page.getByRole("menuitem", { name: "PDF" }).click();
  await expectPdf(await viewDownload, /^tareas-.*\.pdf$/);

  // El parte de horas.
  await page.goto(`/dashboard/workspace/${riuna.workspaceId}/time-sheet`);
  await expect(page.getByText("Instalación eléctrica").first()).toBeVisible({
    timeout: 30_000,
  });
  const sheetDownload = page.waitForEvent("download");
  await page.getByTestId("export-menu").click();
  await page.getByRole("menuitem", { name: "PDF" }).click();
  await expectPdf(await sheetDownload, /^parte-de-horas-.*\.pdf$/);
});
