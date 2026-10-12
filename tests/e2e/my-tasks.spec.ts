import { createTask, expect, test } from "./fixtures";

/**
 * "Mis tareas": Lista, Tablero, Gantt y Tabla personales sobre
 * `GET /my-work/tasks/search` (ADR 037, ADR 039).
 */

// Cuatro rutas nuevas: la primera visita de cada una, en un servidor de
// desarrollo recien arrancado, compila su grafo de modulos bajo demanda antes
// de responder. Medido: el contenido tarda mas de los 10 s por defecto pero
// llega bien formado (comprobado con capturas de fallo), el mismo patron que
// la Fase 0 documento con el test de MCP. Solo hace falta darle mas margen a
// la primera comprobacion de cada ruta, no cambiar lo que se comprueba.
const FIRST_HIT_TIMEOUT = 20_000;

test.describe("Mis tareas", () => {
  test("navega entre las cuatro vistas y conserva lo asignado", async ({
    page,
    riuna,
  }) => {
    const dia = (n: number) =>
      new Date(Date.now() + n * 86_400_000).toISOString();

    const overdueId = await createTask(riuna, "Revisar presupuesto", {
      dueDate: dia(-2),
    });
    const soonId = await createTask(riuna, "Enviar factura", {
      dueDate: dia(3),
    });
    for (const id of [overdueId, soonId]) {
      await riuna.api("put", `/api/task/assignee/${id}`, {
        userId: riuna.userId,
      });
    }

    await page.goto(`/dashboard/workspace/${riuna.workspaceId}/my-tasks`);
    await expect(page).toHaveURL(/\/my-tasks\/list$/);
    await expect(page.getByText("Revisar presupuesto")).toBeVisible({
      timeout: FIRST_HIT_TIMEOUT,
    });
    await expect(page.getByText("Enviar factura")).toBeVisible();

    await page.getByRole("button", { name: "Tablero" }).click();
    await expect(page).toHaveURL(/\/my-tasks\/board$/);
    await expect(page.getByRole("heading", { name: "Vencidas" })).toBeVisible({
      timeout: FIRST_HIT_TIMEOUT,
    });
    await expect(page.getByText("Revisar presupuesto")).toBeVisible();

    await page.getByRole("button", { name: "Tabla" }).click();
    await expect(page).toHaveURL(/\/my-tasks\/table$/);
    await expect(page.getByText("Revisar presupuesto")).toBeVisible({
      timeout: FIRST_HIT_TIMEOUT,
    });

    await page.getByRole("button", { name: "Gantt" }).click();
    await expect(page).toHaveURL(/\/my-tasks\/gantt$/);
    // La barra, por su nombre: la etiqueta de la fila tambien es un boton con
    // el titulo. Con el servidor de desarrollo la etiqueta salia un instante
    // antes y la prueba pasaba; con el build de produccion (el simulacro de
    // restauracion) salen a la vez y el localizador estricto encontraba dos.
    await expect(
      page.getByRole("button", { name: /^Enviar factura: abrir/ }),
    ).toBeVisible({ timeout: FIRST_HIT_TIMEOUT });
  });

  test("el ambito de equipo no ensena lo asignado solo a mi", async ({
    page,
    riuna,
  }) => {
    const personalId = await createTask(riuna, "Solo mia");
    await riuna.api("put", `/api/task/assignee/${personalId}`, {
      userId: riuna.userId,
    });

    await page.goto(`/dashboard/workspace/${riuna.workspaceId}/my-tasks/list`);
    await expect(page.getByText("Solo mia")).toBeVisible();

    await page.getByRole("button", { name: "De mis equipos" }).click();
    await expect(page).toHaveURL(/scope=team/);
    await expect(page.getByText("Nada por aquí")).toBeVisible();
    await expect(page.getByText("Solo mia")).not.toBeVisible();
  });

  test("el Gantt abre el detalle al pulsar y no arrastra", async ({
    page,
    riuna,
  }) => {
    const id = await createTask(riuna, "Instalar cuadro", {
      startDate: new Date().toISOString(),
      dueDate: new Date(Date.now() + 2 * 86_400_000).toISOString(),
    });
    await riuna.api("put", `/api/task/assignee/${id}`, {
      userId: riuna.userId,
    });

    await page.goto(`/dashboard/workspace/${riuna.workspaceId}/my-tasks/gantt`);

    // El nombre accesible completo desambigua de la fila del carril, que
    // tambien lleva el titulo de la tarea. Y es un texto propio de la barra
    // de solo lectura: no promete "arrastrar para mover" donde no se puede.
    const bar = page.getByRole("button", {
      name: "Instalar cuadro: abrir tarea",
    });
    await expect(bar).toBeVisible({ timeout: FIRST_HIT_TIMEOUT });

    // De solo lectura: sin asas de redimensionado, que en el Gantt de
    // proyecto siempre estan en el DOM (ocultas por opacidad, no ausentes).
    await expect(
      page.getByRole("button", { name: "Cambiar la fecha de comienzo" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Cambiar la fecha de vencimiento" }),
    ).toHaveCount(0);

    await bar.click();
    // Sale dos veces en la ficha (cabecera y lateral de propiedades).
    await expect(
      page.getByText(new RegExp(riuna.projectSlug)).first(),
    ).toBeVisible();
  });
});

// Sub-bloque 0.5 del interludio de productividad: la Lista pedia 100 tareas y
// callaba el resto. Ahora dice cuantas hay y carga la pagina siguiente.
test.describe("Mis tareas: mas de una pagina", () => {
  test("la Lista dice «N de M» y «Cargar más» trae el resto", async ({
    page,
    riuna,
  }) => {
    test.setTimeout(120_000);
    for (let index = 1; index <= 101; index += 1) {
      await createTask(riuna, `Tarea ${String(index).padStart(3, "0")}`, {
        userId: riuna.userId,
      });
    }

    await page.goto(`/dashboard/workspace/${riuna.workspaceId}/my-tasks/list`);
    await expect(page.getByText("Mostrando 100 de 101")).toBeVisible({
      timeout: 30_000,
    });

    await page.getByRole("button", { name: "Cargar más" }).click();

    await expect(page.getByText("Mostrando 100 de 101")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Cargar más" })).toHaveCount(
      0,
    );
  });
});
