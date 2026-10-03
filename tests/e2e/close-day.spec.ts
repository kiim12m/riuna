import { createTask, expect, type RiunaContext, test } from "./fixtures";

/** `yyyy-mm-dd` en hora local. */
function localDay(offsetDays: number) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

async function myTask(riuna: RiunaContext, title: string, plannedDay: string) {
  const id = await createTask(riuna, title);
  await riuna.api("put", `/api/task/assignee/${id}`, { userId: riuna.userId });
  await riuna.api(
    "put",
    `/api/planner/${id}?workspaceId=${riuna.workspaceId}`,
    {
      plannedDate: plannedDay,
    },
  );
  return id;
}

/**
 * «Terminar el dia» (sub-bloque 2.1 del interludio de productividad,
 * ADR 054): se entra desde Hoy con un boton, no se sigue sin decidir cada
 * pendiente, y la valoracion se guarda aparte.
 */
test.describe("Terminar el día", () => {
  test("decide cada pendiente, guarda bloqueos y valoración, y deja el día cerrado", async ({
    page,
    riuna,
  }) => {
    const done = await myTask(riuna, "Revisar planos", localDay(0));
    await riuna.api("post", `/api/task/complete/${done}`, { done: true });
    const toMove = await myTask(riuna, "Pedir material", localDay(0));
    const toDrop = await myTask(riuna, "Idea suelta", localDay(-1));

    await page.goto(`/dashboard/workspace/${riuna.workspaceId}/today`);
    await page
      .getByRole("button", { name: "Terminar el día" })
      .click({ timeout: 30_000 });

    await expect(page.getByTestId("ritual-step-summary")).toContainText(
      "Has terminado 1 tarea.",
    );
    await page.getByRole("button", { name: "Siguiente" }).click();

    const next = page.getByRole("button", { name: "Siguiente" });
    await expect(next).toBeDisabled();
    await expect(page.getByText("2 sin decidir")).toBeVisible();
    await page.getByRole("button", { name: /^Todo a / }).click();
    await page
      .getByTestId("close-day-pending")
      .filter({ hasText: "Idea suelta" })
      .getByRole("button", { name: "Fuera del plan" })
      .click();
    await next.click();

    await page
      .getByRole("textbox", { name: "Qué te frena" })
      .fill("Esperando al proveedor");
    await page.getByRole("button", { name: "Siguiente" }).click();

    await expect(page.getByText("Solo lo ves tú.")).toBeVisible();
    await page.getByRole("button", { name: "Bastante", exact: true }).click();
    await page.getByRole("button", { name: "Normal", exact: true }).click();
    await page.getByLabel("Nota").fill("Muchas interrupciones");
    await page.getByRole("button", { name: "Siguiente" }).click();

    await expect(page.getByTestId("ritual-step-next")).toContainText(
      "Pedir material",
    );
    await page.getByRole("button", { name: "Cerrar el día" }).click();

    await expect(page).toHaveURL(/\/today$/);
    await expect(
      page.getByRole("button", { name: "Día cerrado" }),
    ).toBeVisible();

    const review = await riuna.api<{
      review: {
        blockers: string;
        summary: { moved: number; unplanned: number };
      };
      private: { impact: number; energy: number; note: string };
    }>(
      "get",
      `/api/review/day/${localDay(0)}?workspaceId=${riuna.workspaceId}`,
    );
    expect(review.review.blockers).toBe("Esperando al proveedor");
    expect(review.review.summary).toMatchObject({ moved: 1, unplanned: 1 });
    expect(review.private).toEqual({
      impact: 3,
      energy: 2,
      note: "Muchas interrupciones",
    });

    const today = await riuna.api<{ planned: { id: string }[] }>(
      "get",
      `/api/today?workspaceId=${riuna.workspaceId}`,
    );
    expect(today.planned.map((entry) => entry.id)).not.toContain(toMove);
    const entry = await riuna.api<{ entry: unknown }>(
      "get",
      `/api/planner/entry/${toDrop}?workspaceId=${riuna.workspaceId}`,
    );
    expect(entry.entry).toBeNull();
  });

  test("«Todo a…» salta un festivo", async ({ page, riuna }) => {
    // El siguiente dia laborable (lunes a viernes, la jornada por defecto) y
    // el que le sigue: si el primero es festivo, «mañana» es el segundo.
    const workDay = (after: string) => {
      const [year, month, day] = after.split("-").map(Number);
      const date = new Date(year, month - 1, day);
      do {
        date.setDate(date.getDate() + 1);
      } while (date.getDay() === 0 || date.getDay() === 6);
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const d = String(date.getDate()).padStart(2, "0");
      return `${date.getFullYear()}-${m}-${d}`;
    };
    const holiday = workDay(localDay(0));
    const expected = workDay(holiday);

    await riuna.api(
      "post",
      `/api/availability/holidays?workspaceId=${riuna.workspaceId}`,
      { day: holiday, name: "Fiesta local" },
    );
    await myTask(riuna, "Pedir material", localDay(0));

    await page.goto(`/dashboard/workspace/${riuna.workspaceId}/today`);
    await page
      .getByRole("button", { name: "Terminar el día" })
      .click({ timeout: 30_000 });
    await page.getByRole("button", { name: "Siguiente" }).click();

    const [year, month, day] = expected.split("-").map(Number);
    const label = new Intl.DateTimeFormat("es-ES", {
      weekday: "short",
      day: "numeric",
      month: "short",
    }).format(new Date(year, month - 1, day));
    await expect(page.getByRole("button", { name: /^Todo a / })).toHaveText(
      `Todo a ${label}`,
    );
  });
});
