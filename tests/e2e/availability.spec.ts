import { createTask, expect, type RiunaContext, test } from "./fixtures";

function keyOf(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function dayFromNow(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return keyOf(date);
}

/** Sin nada asignado el Planificador enseña su vacio, no sus columnas. */
async function assignSomething(riuna: RiunaContext) {
  const taskId = await createTask(riuna, "Algo que planificar");
  await riuna.api("put", `/api/task/assignee/${taskId}`, {
    userId: riuna.userId,
  });
}

/**
 * Ausencias y festivos (sub-bloque 5.1 del interludio de productividad,
 * ADR 060): se dan en sus ajustes y el Planificador, el Cronograma y Hoy lo
 * enseñan, con la capacidad del dia a 0.
 */
test.describe("Ausencias y festivos", () => {
  test("una ausencia deja hoy sin horas y se ve en el Planificador", async ({
    page,
    riuna,
  }) => {
    await assignSomething(riuna);
    await page.goto(`/dashboard/workspace/${riuna.workspaceId}/today`);
    await page.getByRole("button", { name: "Personal", exact: true }).waitFor({
      timeout: 30_000,
    });
    await page.goto("/dashboard/settings/account/preferences");
    const section = page.getByTestId("time-off-section");
    await expect(section).toContainText("No hay ausencias próximas.", {
      timeout: 30_000,
    });

    await section.getByLabel("Desde").fill(dayFromNow(0));
    await section.getByLabel("Hasta").fill(dayFromNow(1));
    await section.getByLabel("Nota").fill("Médico");
    await section.getByRole("button", { name: "Añadir ausencia" }).click();
    await expect(section).toContainText("Médico");

    await page.goto(`/dashboard/workspace/${riuna.workspaceId}/today`);
    await expect(page.getByTestId("day-off-badge")).toHaveText("Ausente", {
      timeout: 30_000,
    });
    await expect(
      page.getByText("Hoy no cuenta horas disponibles."),
    ).toBeVisible();
    // La nota no sale de los ajustes.
    await expect(page.getByText("Médico")).toHaveCount(0);

    await page.goto(`/dashboard/workspace/${riuna.workspaceId}/planner`);
    const tomorrow = page.getByTestId(`planner-column-${dayFromNow(1)}`);
    await expect(tomorrow.getByTestId("day-off-badge")).toHaveText("Ausente", {
      timeout: 30_000,
    });
    await expect(tomorrow).toContainText("0 %");

    await page.goto("/dashboard/settings/account/preferences");
    await section.getByRole("button", { name: "Quitar la ausencia" }).click();
    await expect(section).toContainText("No hay ausencias próximas.");
  });

  test("un festivo del espacio se ve en el Planificador y el Cronograma", async ({
    page,
    riuna,
  }) => {
    const day = dayFromNow(2);
    await assignSomething(riuna);
    await page.goto(
      `/dashboard/workspace/${riuna.workspaceId}/admin/workspace/holidays`,
    );
    await expect(page.getByText("Aún no hay festivos.")).toBeVisible({
      timeout: 30_000,
    });
    await page.getByLabel("Día").fill(day);
    await page.getByLabel("Nombre").fill("Fiesta local");
    await page.getByRole("button", { name: "Añadir festivo" }).click();
    await expect(page.getByTestId("holiday-list")).toContainText(
      "Fiesta local",
    );

    await page.goto(`/dashboard/workspace/${riuna.workspaceId}/planner`);
    await expect(
      page.getByTestId(`planner-column-${day}`).getByTestId("day-off-badge"),
    ).toHaveText("Festivo · Fiesta local", { timeout: 30_000 });

    await page.goto(
      `/dashboard/workspace/${riuna.workspaceId}/schedule?view=day&date=${day}`,
    );
    await expect(
      page.getByTestId(`schedule-column-${day}`).getByTestId("day-off-badge"),
    ).toHaveText("Festivo · Fiesta local", { timeout: 30_000 });
  });
});
