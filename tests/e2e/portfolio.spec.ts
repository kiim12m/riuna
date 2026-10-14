import { expect, test } from "./fixtures";

/**
 * La cartera (ADR 088): los campos de proyecto son columnas que se editan en
 * la celda, la lista se filtra con el motor de las vistas por esos campos y se
 * exporta a Excel con el filtro que se ve.
 */
test("la lista de proyectos filtra por un campo de proyecto, se edita en la celda y se exporta", async ({
  page,
  riuna,
}) => {
  const define = (body: Record<string, unknown>) =>
    riuna.api("post", `/api/field/workspace/${riuna.workspaceId}`, {
      entity: "project",
      ...body,
    });
  await define({ name: "Cliente", type: "text" });
  await define({ name: "Presupuesto", type: "number" });
  const other = await riuna.api<{ id: string }>("post", "/api/project", {
    name: "Alumbrado del polideportivo",
    workspaceId: riuna.workspaceId,
    icon: "Folder",
    slug: `alu${Date.now().toString().slice(-4)}`,
  });
  await riuna.api("put", `/api/project/${riuna.projectId}/custom-fields`, {
    values: { presupuesto: 96000 },
  });
  await riuna.api("put", `/api/project/${other.id}/custom-fields`, {
    values: { presupuesto: 21500 },
  });

  // Sin filtro: las dos, y el cliente se rellena en la propia celda.
  await page.goto(`/dashboard/workspace/${riuna.workspaceId}/admin/projects`);
  const table = page.getByTestId("portfolio-table");
  await expect(table.getByRole("button", { name: "Presupuesto" })).toBeVisible({
    timeout: 30_000,
  });
  const row = table.getByRole("row").filter({ hasText: "Alumbrado" });
  await row.getByRole("button", { name: "—" }).first().click();
  await row.getByRole("textbox").fill("Ayto. de Coslada");
  await row.getByRole("textbox").press("Enter");
  await expect
    .poll(async () => {
      const projects = await riuna.api<
        Array<{ id: string; customFields: Record<string, unknown> }>
      >("get", `/api/project?workspaceId=${riuna.workspaceId}`);
      return projects.find((project) => project.id === other.id)?.customFields
        .cliente;
    })
    .toBe("Ayto. de Coslada");

  // Con el filtro en la URL, como un enlace pegado: solo la cara.
  const filter = [
    { id: "c1", field: "custom.presupuesto", operator: "gt", value: 50000 },
  ];
  await page.goto(
    `/dashboard/workspace/${riuna.workspaceId}/admin/projects?filter=${encodeURIComponent(JSON.stringify(filter))}`,
  );
  await expect(table.getByText("Proyecto E2E")).toBeVisible({
    timeout: 30_000,
  });
  await expect(table.getByText("Alumbrado del polideportivo")).toHaveCount(0);

  // Excel o PDF desde el mismo menu (ADR 091).
  for (const [format, extension] of [
    ["Excel", "xlsx"],
    ["PDF", "pdf"],
  ] as const) {
    const download = page.waitForEvent("download");
    await page.getByTestId("portfolio-export").click();
    await page.getByRole("menuitem", { name: format }).click();
    expect((await download).suggestedFilename()).toMatch(
      new RegExp(`^proyectos-.*\\.${extension}$`),
    );
  }
});
