import { expect, test } from "./fixtures";

type Listed = {
  data: { columns: { slug: string; tasks: { title: string }[] }[] };
};

/**
 * Crear una tarea sin salir de la columna: un titulo y Intro, y se queda abierto
 * para la siguiente. El «+» de la cabecera sigue abriendo el formulario entero.
 */
test("crea varias tareas seguidas al pie de una columna", async ({
  page,
  riuna,
}) => {
  await page.goto(
    `/dashboard/workspace/${riuna.workspaceId}/project/${riuna.projectId}/board`,
  );

  // La segunda columna es «En curso».
  // Por su texto visible: el «+» de la cabecera tiene el mismo nombre
  // accesible, por `title`, y no es el compositor.
  const add = page.getByText("Añadir tarea", { exact: true }).nth(1);
  await add.click({ timeout: 30_000 });

  const input = page.getByPlaceholder("Título de la tarea…");
  await input.fill("Pedir presupuesto");
  await input.press("Enter");
  // Sigue abierto y vacio, con el foco: la siguiente va sin tocar el raton.
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("");
  await input.fill("Replantear la zanja");
  await input.press("Enter");

  await expect(page.getByText("Pedir presupuesto")).toBeVisible();
  await expect(page.getByText("Replantear la zanja")).toBeVisible();
  await page.screenshot({
    path: "/tmp/claude-1000/-workspaces-riuna/b6946055-75cf-418e-9ad9-3ddadc1c692f/scratchpad/x-composer.png",
  });

  const listed = await riuna.api<Listed>(
    "get",
    `/api/task/tasks/${riuna.projectId}`,
  );
  const column = listed.data.columns.find(
    (entry) => entry.slug === "in-progress",
  );
  expect(column?.tasks.map((task) => task.title).sort()).toEqual([
    "Pedir presupuesto",
    "Replantear la zanja",
  ]);

  // Esc lo cierra sin crear nada.
  await input.fill("No se crea");
  await input.press("Escape");
  await expect(input).toHaveCount(0);
  await expect(page.getByText("No se crea")).toHaveCount(0);
});
