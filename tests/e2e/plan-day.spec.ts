import { createTask, expect, type RiunaContext, test } from "./fixtures";

/** `yyyy-mm-dd` en hora local. */
function localDay(offsetDays: number) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

async function myTask(
  riuna: RiunaContext,
  title: string,
  options: { plannedDay?: string; dueDate?: string } = {},
) {
  const id = await createTask(
    riuna,
    title,
    options.dueDate ? { dueDate: options.dueDate } : {},
  );
  await riuna.api("put", `/api/task/assignee/${id}`, { userId: riuna.userId });
  if (options.plannedDay) {
    await riuna.api(
      "put",
      `/api/planner/${id}?workspaceId=${riuna.workspaceId}`,
      { plannedDate: options.plannedDay },
    );
  }
  return id;
}

type Entry = { id: string; startMinute: number | null; keyRank: number | null };

/**
 * «Planificar el dia» (sub-bloque 2.2 del interludio de productividad): cada
 * paso actua al momento sobre el plan de hoy, y «Empezar» arranca el
 * cronometro en la primera imprescindible.
 */
test.describe("Planificar el día", () => {
  test("trae lo de ayer, lo urgente y lo sin planificar, marca la clave, ancla y empieza", async ({
    page,
    riuna,
  }) => {
    const previous = await myTask(riuna, "Atrasada", {
      plannedDay: localDay(-1),
    });
    const urgent = await myTask(riuna, "Vence hoy", {
      dueDate: new Date().toISOString(),
    });
    const loose = await myTask(riuna, "Sin día");
    const key = await myTask(riuna, "La importante", {
      plannedDay: localDay(0),
    });

    await page.goto(`/dashboard/workspace/${riuna.workspaceId}/today`);
    await page
      .getByRole("button", { name: "Planificar el día" })
      .click({ timeout: 30_000 });

    const next = page.getByRole("button", { name: "Siguiente" });
    await page
      .getByTestId("plan-day-previous")
      .filter({ hasText: "Atrasada" })
      .getByRole("button", { name: "Añadir a hoy" })
      .click();
    await expect(
      page.getByText("No queda nada de días anteriores."),
    ).toBeVisible();
    await next.click();

    await page
      .getByTestId("plan-day-urgent")
      .filter({ hasText: "Vence hoy" })
      .getByRole("button", { name: "Planificar hoy" })
      .click();
    await expect(page.getByText("Nada urgente.")).toBeVisible();
    await next.click();

    await page
      .getByTestId("plan-day-unplanned")
      .filter({ hasText: "Sin día" })
      .getByRole("button", { name: "Planificar hoy" })
      .click();
    await expect(
      page.getByTestId("plan-day-unplanned").filter({ hasText: "Sin día" }),
    ).toBeHidden();
    await next.click();

    await page
      .getByTestId("plan-day-key")
      .filter({ hasText: "La importante" })
      .getByRole("button", { name: "Imprescindible" })
      .click();
    await expect(page.getByText(/Llevas 1 de 3/)).toBeVisible();
    await next.click();

    await expect(page.getByText(/Planificado .* disponibles/)).toBeVisible();
    await next.click();

    const time = page.getByRole("textbox", { name: "Hora de «Sin día»" });
    await time.fill("10:00");
    await time.press("Enter");
    await expect
      .poll(async () => {
        const today = await riuna.api<{ planned: Entry[] }>(
          "get",
          `/api/today?workspaceId=${riuna.workspaceId}`,
        );
        return today.planned.find((entry) => entry.id === loose)?.startMinute;
      })
      .toBe(600);

    await page.getByRole("button", { name: "Empezar" }).click();
    await expect(page).toHaveURL(/\/today$/);

    const today = await riuna.api<{ planned: Entry[] }>(
      "get",
      `/api/today?workspaceId=${riuna.workspaceId}`,
    );
    expect(today.planned.map((entry) => entry.id).sort()).toEqual(
      [previous, urgent, loose, key].sort(),
    );
    expect(today.planned.find((entry) => entry.id === key)?.keyRank).toBe(1);
    await expect
      .poll(async () => {
        const running = await riuna.api<{
          running: { task: { id: string } } | null;
        }>("get", `/api/time-entry/running?workspaceId=${riuna.workspaceId}`);
        return running.running?.task.id;
      })
      .toBe(key);
  });
});
