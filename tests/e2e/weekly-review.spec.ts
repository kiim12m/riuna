import { createTask, expect, type RiunaContext, test } from "./fixtures";

function keyOf(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** La semana que la pantalla elige por defecto, con la semana empezando en domingo (preferencia por defecto). */
function reviewedWeekStart() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sinceStart = today.getDay();
  today.setDate(today.getDate() - sinceStart - (sinceStart < 2 ? 7 : 0));
  return keyOf(today);
}

async function myTask(riuna: RiunaContext, title: string, extra = {}) {
  const id = await createTask(riuna, title, extra);
  await riuna.api("put", `/api/task/assignee/${id}`, { userId: riuna.userId });
  return id;
}

/**
 * La revision semanal (sub-bloque 2.3 del interludio de productividad): se
 * repasa lo de Personal sin salir del ritual, se repasa lo vencido, y se guarda
 * con bloqueos y valoracion.
 */
test.describe("Revisión semanal", () => {
  test("repasa lo personal y lo vencido, y guarda la semana", async ({
    page,
    riuna,
  }) => {
    await riuna.api("post", "/api/capture", {
      workspaceId: riuna.workspaceId,
      title: "Idea capturada",
    });
    const overdueDate = new Date();
    overdueDate.setDate(overdueDate.getDate() - 3);
    const overdue = await myTask(riuna, "Atrasada", {
      dueDate: overdueDate.toISOString(),
    });
    const done = await myTask(riuna, "Terminada esta semana");
    await riuna.api("post", `/api/task/complete/${done}`, { done: true });

    await page.goto(`/dashboard/workspace/${riuna.workspaceId}/planner`);
    await page
      .getByRole("button", { name: "Revisión semanal" })
      .click({ timeout: 30_000 });

    const inboxRow = page
      .getByTestId("weekly-inbox")
      .filter({ hasText: "Idea capturada" });
    await inboxRow.getByRole("button", { name: "Mover tarea" }).click();
    await page.getByText("Selecciona un proyecto").click();
    await page.getByRole("option", { name: "Proyecto E2E" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Mover tarea" })
      .click();
    await expect(page.getByText("No tienes nada en Personal.")).toBeVisible();
    await expect(page).toHaveURL(/rituals\/weekly-review/);

    const next = page.getByRole("button", { name: "Siguiente" });
    await next.click();
    await page
      .getByTestId("weekly-overdue")
      .filter({ hasText: "Atrasada" })
      .getByRole("button", { name: "Acciones de la tarea" })
      .click();
    await page.getByRole("menuitem", { name: "Planificar hoy" }).click();
    await expect
      .poll(async () => {
        const entry = await riuna.api<{ entry: unknown }>(
          "get",
          `/api/planner/entry/${overdue}?workspaceId=${riuna.workspaceId}`,
        );
        return entry.entry !== null;
      })
      .toBe(true);

    await next.click();
    await next.click();
    await expect(page.getByTestId("weekly-stats")).toContainText("Hechas1");

    await next.click();
    await expect(page.getByTestId("weekly-next-load")).toBeVisible();
    await next.click();

    await page.getByLabel("Qué te frena").fill("Pendiente del cliente");
    await page.getByRole("button", { name: "Mucho", exact: true }).click();
    await page.getByRole("button", { name: "Cerrar la semana" }).click();
    await expect(page).toHaveURL(/\/today$/);

    const review = await riuna.api<{
      review: { blockers: string; summary: { done: number } };
      private: { impact: number };
    }>(
      "get",
      `/api/review/week/${reviewedWeekStart()}?workspaceId=${riuna.workspaceId}`,
    );
    expect(review.review.blockers).toBe("Pendiente del cliente");
    expect(review.review.summary.done).toBeGreaterThanOrEqual(1);
    expect(review.private.impact).toBe(4);
  });
});
