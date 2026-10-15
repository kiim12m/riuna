import { createTask, expect, test } from "./fixtures";

type Page = { id: string; version: number };

/**
 * La wiki de paginas (ADR 092): crear y editar desde la pestaña Wiki, el
 * aviso cuando otro guarda mientras se edita, el historial y borrar una
 * pagina con subpaginas.
 */
test("una página se crea, se edita, avisa del conflicto y vuelve a una versión", async ({
  page,
  riuna,
}) => {
  await page.goto(
    `/dashboard/workspace/${riuna.workspaceId}/project/${riuna.projectId}/wiki`,
  );
  const tree = page.getByTestId("wiki-tree").filter({ visible: true });
  await expect(tree).toBeVisible({ timeout: 30_000 });

  // Una pagina del proyecto, desde el «+» de su grupo.
  await tree
    .getByRole("button", { name: /Nueva página en (?!Espacio)/ })
    .click();
  const create = page.getByRole("dialog", { name: "Página nueva" });
  await create
    .getByRole("textbox", { name: "Título" })
    .fill("Puesta en marcha");
  await create.getByRole("button", { name: "Crear la página" }).click();

  // Se abre para escribir.
  const editor = page.getByRole("region", { name: "Editor de la página" });
  await expect(editor).toBeVisible({ timeout: 30_000 });
  await editor.locator(".riuna-tiptap-prose").click();
  await page.keyboard.type("Cerrar el general con todo abierto.");
  await expect(
    page.getByText("Borrador guardado en este navegador"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Guardar", exact: true }).click();

  const article = page.getByTestId("wiki-page");
  await expect(
    article.getByText("Cerrar el general con todo abierto."),
  ).toBeVisible();
  await expect(article.getByText(/Versión 2 · editada por/)).toBeVisible();

  const pages = await riuna.api<Array<{ id: string; title: string }>>(
    "get",
    `/api/wiki/workspace/${riuna.workspaceId}/pages?projectId=${riuna.projectId}`,
  );
  const pageId = pages.find((entry) => entry.title === "Puesta en marcha")?.id;
  expect(pageId).toBeTruthy();

  // Otra persona —aqui, la API— guarda mientras se edita: sale el aviso.
  await article.getByRole("button", { name: "Editar" }).click();
  await editor.locator(".riuna-tiptap-prose").click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Y medir.");
  await riuna.api<Page>("put", `/api/wiki/page/${pageId}`, {
    title: "Puesta en marcha",
    content: "Versión de otra persona.",
    baseVersion: 2,
  });
  const conflict = page.getByTestId("wiki-conflict");
  await expect(conflict).toBeVisible({ timeout: 15_000 });
  await expect(conflict).toContainText("La suya es la versión 3");
  await conflict
    .getByRole("button", { name: "Guardar encima de la suya" })
    .click();
  await expect(article.getByText(/Y medir\./)).toBeVisible();
  await expect(article.getByText(/Versión 4 · editada por/)).toBeVisible();

  // El historial: volver a la versión 3, la de la otra persona.
  const history = page
    .getByRole("complementary", { name: "Historial" })
    .filter({
      visible: true,
    });
  if (!(await history.isVisible())) {
    await article.getByRole("button", { name: "Historial" }).click();
  }
  await history
    .first()
    .getByRole("button", { name: /^Versión 3/ })
    .click();
  await expect(history.first().getByTestId("wiki-diff")).toBeVisible();
  await history
    .first()
    .getByRole("button", { name: "Restaurar la versión 3" })
    .click();
  await expect(article.getByText("Versión de otra persona.")).toBeVisible();
  await expect(article.getByText(/Versión 5 · editada por/)).toBeVisible();
  await expect(
    history.first().getByText(/Restaura la versión 3/),
  ).toBeVisible();
});

test("borrar una página con subpáginas deja elegir, y una tarea la enlaza", async ({
  page,
  riuna,
}) => {
  const parent = await riuna.api<Page>(
    "post",
    `/api/wiki/workspace/${riuna.workspaceId}/pages`,
    { title: "Procedimientos", projectId: riuna.projectId },
  );
  await riuna.api<Page>(
    "post",
    `/api/wiki/workspace/${riuna.workspaceId}/pages`,
    {
      title: "Corte de suministro",
      projectId: riuna.projectId,
      parentId: parent.id,
    },
  );
  const taskId = await createTask(riuna, "Avisar a la distribuidora");
  await riuna.api("put", `/api/task/description/${taskId}`, {
    description: `Seguir <riuna-page-link page-id="${parent.id}" title="Procedimientos" url="/dashboard/workspace/${riuna.workspaceId}/project/${riuna.projectId}/wiki?page=${parent.id}"></riuna-page-link>.`,
  });

  // La pagina dice que tarea la enlaza…
  await page.goto(
    `/dashboard/workspace/${riuna.workspaceId}/project/${riuna.projectId}/wiki?page=${parent.id}`,
  );
  const article = page.getByTestId("wiki-page");
  await expect(article.getByTestId("wiki-linked-task")).toBeVisible({
    timeout: 30_000,
  });

  // …y la tarea, que pagina.
  await page.goto(
    `/dashboard/workspace/${riuna.workspaceId}/project/${riuna.projectId}/task/${taskId}`,
  );
  await expect(
    page.getByTestId("task-wiki-links").getByText("Procedimientos"),
  ).toBeVisible({ timeout: 30_000 });

  // Borrar la madre: se elige subir la hija.
  await page.goto(
    `/dashboard/workspace/${riuna.workspaceId}/project/${riuna.projectId}/wiki?page=${parent.id}`,
  );
  await article.getByRole("button", { name: "Más acciones" }).click({
    timeout: 30_000,
  });
  await page.getByRole("menuitem", { name: "Borrar" }).click();
  const dialog = page.getByRole("dialog", { name: /Borrar Procedimientos/ });
  await expect(dialog.getByText("Su subpágina sube un nivel.")).toBeVisible();
  await dialog.getByRole("button", { name: "Borrar la página" }).click();
  await expect(dialog).toBeHidden();

  const left = await riuna.api<
    Array<{ title: string; parentId: string | null }>
  >(
    "get",
    `/api/wiki/workspace/${riuna.workspaceId}/pages?projectId=${riuna.projectId}`,
  );
  expect(left).toEqual([
    expect.objectContaining({ title: "Corte de suministro", parentId: null }),
  ]);
});
