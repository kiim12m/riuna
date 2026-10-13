import { createTask, expect, test } from "./fixtures";

/**
 * Totales y colores en la Tabla (ADR 080): la franja suma todo el filtro y
 * las filas se colorean por prioridad.
 */
test("la Tabla suma el filtro y colorea por prioridad", async ({
  page,
  riuna,
}) => {
  const urgent = await createTask(riuna, "Cuadro general", {
    priority: "urgent",
  });
  const low = await createTask(riuna, "Rótulos", { priority: "low" });
  await riuna.api("put", `/api/task/estimate/${urgent}`, { estimate: 7200 });
  await riuna.api("put", `/api/task/estimate/${low}`, { estimate: 1800 });

  await page.goto(
    `/dashboard/workspace/${riuna.workspaceId}/project/${riuna.projectId}/table`,
  );
  const totals = page.getByTestId("table-totals");
  await expect(totals).toContainText("Total del filtro · 2 tareas", {
    timeout: 30_000,
  });
  await expect(totals).toContainText("2,5 h");

  await page.getByTestId("table-color").click();
  await page.getByRole("option", { name: "Prioridad" }).click();
  await expect(page).toHaveURL(/color=priority/);
  await expect(
    page.getByRole("row").filter({ hasText: "Cuadro general" }),
  ).toHaveClass(/bg-destructive/);
  await expect(
    page.getByRole("row").filter({ hasText: "Rótulos" }),
  ).not.toHaveClass(/bg-destructive|bg-warning/);
});
