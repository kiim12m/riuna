import { createTask, expect, type RiunaContext, test } from "./fixtures";

/** `yyyy-mm-dd` en hora local. */
function localDay(offsetDays: number) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

async function myTask(riuna: RiunaContext, title: string, plannedDay?: string) {
  const id = await createTask(riuna, title);
  await riuna.api("put", `/api/task/assignee/${id}`, { userId: riuna.userId });
  if (plannedDay) {
    await riuna.api(
      "put",
      `/api/planner/${id}?workspaceId=${riuna.workspaceId}`,
      { plannedDate: plannedDay },
    );
  }
  return id;
}

type PlanEntry = {
  id: string;
  plannedDate: string;
  startMinute: number | null;
  estimate: number | null;
  keyRank: number | null;
};

/**
 * Acciones de fila, imprescindibles y plan en bloque (sub-bloque 1.3 del
 * interludio de productividad, ADR 053).
 */
test.describe("Acciones de fila", () => {
  test("marca hasta tres imprescindibles desde el menú y avisa de la cuarta", async ({
    page,
    riuna,
  }) => {
    const ids: string[] = [];
    for (const title of ["Uno", "Dos", "Tres", "Cuatro"]) {
      ids.push(await myTask(riuna, `Tarea ${title}`, localDay(0)));
    }

    await page.goto(`/dashboard/workspace/${riuna.workspaceId}/today`);
    for (const id of ids) {
      const row = page.getByTestId(`today-row-${id}`);
      await row
        .getByRole("button", { name: "Acciones de la tarea" })
        .click({ timeout: 30_000 });
      await page
        .getByRole("menuitemcheckbox", { name: "Imprescindible" })
        .click();
      // El menu sale con una animacion, y mientras sale sigue en la pagina:
      // abrir el de la fila siguiente antes daba dos «Imprescindible» a la
      // vez. Pasaba en el simulacro, que corre contra la version de
      // produccion y va mas deprisa.
      await expect(page.getByRole("menu")).toHaveCount(0);
    }

    const keyGroup = page.getByTestId("today-key-tasks");
    await expect(keyGroup).toContainText("3 imprescindibles de 3");
    for (const title of ["Uno", "Dos", "Tres"]) {
      await expect(keyGroup).toContainText(`Tarea ${title}`);
    }
    await expect(keyGroup).not.toContainText("Tarea Cuatro");
    await expect(
      page.getByText("Ese día ya tiene tres imprescindibles"),
    ).toBeVisible();
  });

  test("el menú contextual planifica para mañana", async ({ page, riuna }) => {
    const id = await myTask(riuna, "Revisar la obra", localDay(0));

    await page.goto(`/dashboard/workspace/${riuna.workspaceId}/today`);
    const row = page.getByTestId(`today-row-${id}`);
    await row.click({ button: "right", timeout: 30_000 });
    // Solo el contextual: el desplegable «⋯» compartia estado y se abria con el.
    await expect(page.getByRole("menu")).toHaveCount(1);
    await page.getByRole("menuitem", { name: "Planificar mañana" }).click();

    await expect(row).toBeHidden();
    const plan = await riuna.api<{ entries: PlanEntry[] }>(
      "get",
      `/api/planner?workspaceId=${riuna.workspaceId}`,
    );
    const entry = plan.entries.find((candidate) => candidate.id === id);
    expect(entry).toBeDefined();
    const planned = new Date(entry?.plannedDate ?? "");
    expect(planned.getDate()).toBe(new Date(`${localDay(1)}T00:00`).getDate());
  });

  test("estima y fija la hora desde sus diálogos", async ({ page, riuna }) => {
    const id = await myTask(riuna, "Medir el cuadro", localDay(0));

    await page.goto(`/dashboard/workspace/${riuna.workspaceId}/today`);
    const menu = page
      .getByTestId(`today-row-${id}`)
      .getByRole("button", { name: "Acciones de la tarea" });

    await menu.click({ timeout: 30_000 });
    await page.getByRole("menuitem", { name: "Estimar…" }).click();
    await page.getByLabel("Estimación", { exact: true }).fill("1h30");
    await page.getByRole("button", { name: "Guardar" }).click();

    await menu.click();
    await page.getByRole("menuitem", { name: "Fijar hora…" }).click();
    await page.getByLabel("Hora de inicio").fill("10:00");
    await page.getByRole("button", { name: "Guardar" }).click();

    await expect
      .poll(async () => {
        const today = await riuna.api<{ planned: PlanEntry[] }>(
          "get",
          `/api/today?workspaceId=${riuna.workspaceId}`,
        );
        const entry = today.planned.find((candidate) => candidate.id === id);
        return [entry?.estimate, entry?.startMinute];
      })
      .toEqual([5400, 600]);
  });

  test("«Añadir todo a hoy» trae lo de días anteriores de una vez", async ({
    page,
    riuna,
  }) => {
    const first = await myTask(riuna, "Atrasada uno", localDay(-1));
    const second = await myTask(riuna, "Atrasada dos", localDay(-2));

    await page.goto(`/dashboard/workspace/${riuna.workspaceId}/today`);
    await page
      .getByRole("button", { name: "Añadir todo a hoy" })
      .click({ timeout: 30_000 });

    await expect(
      page.getByRole("button", { name: /De días anteriores/ }),
    ).toBeHidden();
    const today = await riuna.api<{ planned: PlanEntry[] }>(
      "get",
      `/api/today?workspaceId=${riuna.workspaceId}`,
    );
    expect(today.planned.map((entry) => entry.id).sort()).toEqual(
      [first, second].sort(),
    );
  });

  test("desde Mis tareas se planifica para hoy", async ({ page, riuna }) => {
    const id = await myTask(riuna, "Llamar al cliente");

    await page.goto(`/dashboard/workspace/${riuna.workspaceId}/my-tasks/list`);
    await page
      .getByRole("button", { name: "Acciones de la tarea" })
      .first()
      .click({ timeout: 30_000 });
    await page.getByRole("menuitem", { name: "Planificar hoy" }).click();

    await expect
      .poll(async () => {
        const today = await riuna.api<{ planned: PlanEntry[] }>(
          "get",
          `/api/today?workspaceId=${riuna.workspaceId}`,
        );
        return today.planned.map((entry) => entry.id);
      })
      .toContain(id);
  });

  test("el Planificador va más allá de quince días, de día en día", async ({
    page,
    riuna,
  }) => {
    await myTask(riuna, "Revisión trimestral", localDay(15));
    await myTask(riuna, "Llamar al proveedor", localDay(-1));
    await myTask(riuna, "Preparar la oferta");

    await page.goto(`/dashboard/workspace/${riuna.workspaceId}/planner`);
    await page
      .getByRole("button", { name: "Día siguiente" })
      .waitFor({ timeout: 30_000 });
    await expect(page.getByText("Revisión trimestral")).toBeHidden();

    // «Sin planificar» y «De días anteriores» comparten columna: una encima
    // de otra, no una al lado de otra.
    const unplanned = await page
      .getByTestId("planner-column-unplanned")
      .boundingBox();
    const previous = await page
      .getByTestId("planner-column-previous")
      .boundingBox();
    expect(previous?.x).toBe(unplanned?.x);
    expect(previous?.y ?? 0).toBeGreaterThan(
      (unplanned?.y ?? 0) + (unplanned?.height ?? 0) - 1,
    );

    // Cada flecha mueve la ventana un día.
    await page.getByRole("button", { name: "Día siguiente" }).click();
    await expect(page).toHaveURL(new RegExp(`from=${localDay(1)}`));
    await expect(
      page
        .getByTestId(`planner-column-${localDay(15)}`)
        .getByText("Revisión trimestral"),
    ).toBeVisible();
    await page.getByRole("button", { name: "Día siguiente" }).click();
    await expect(page).toHaveURL(new RegExp(`from=${localDay(2)}`));
    await page.getByRole("button", { name: "Día anterior" }).click();
    await expect(page).toHaveURL(new RegExp(`from=${localDay(1)}`));

    await page.getByRole("button", { name: "Volver a hoy" }).click();
    await expect(page).not.toHaveURL(/from=/);
  });
});
