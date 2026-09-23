import { createTask, expect, test } from "./fixtures";

/** El mismo calculo de "manana" que usan las pruebas de integracion: evita
 * que la asercion dependa de la hora real a la que corre esto (ADR 041, el
 * reparto de "hoy" arranca en `max(inicio de jornada, ahora)`). */
function tomorrowIso() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

/**
 * El Cronograma: reparto por horas sobre `personal_plan_entry` (ADR 041). Lo
 * que un navegador de verdad puede ver que ninguna prueba de API puede: que
 * arrastrar un tramo verticalmente lo ancla a una hora de verdad.
 */
test.describe("Cronograma", () => {
  test("anchors a flowing entry to a clock time by dragging it", async ({
    page,
    riuna,
  }) => {
    const taskId = await createTask(riuna, "Levantar plano electrico", {
      estimate: 1800,
    });
    await riuna.api("put", `/api/task/assignee/${taskId}`, {
      userId: riuna.userId,
    });
    await riuna.api(
      "put",
      `/api/planner/${taskId}?workspaceId=${riuna.workspaceId}`,
      {
        plannedDate: tomorrowIso(),
        position: 0,
      },
    );

    await page.goto(`/dashboard/workspace/${riuna.workspaceId}/schedule`);

    const segment = page.getByTestId(`schedule-segment-${taskId}`);
    await expect(segment).toBeVisible({ timeout: 20_000 });
    await expect(segment).toHaveAttribute("data-pinned", "false");

    const box = await segment.boundingBox();
    if (!box) throw new Error("No se pudo medir el tramo");

    // No `dragTo`: el arrastre escucha eventos de puntero, no HTML5 nativo.
    await page.mouse.move(box.x + box.width / 2, box.y + 4);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + 4 + 42, {
      steps: 6,
    });
    await page.mouse.move(box.x + box.width / 2, box.y + 4 + 84, {
      steps: 6,
    });
    await page.mouse.up();

    await expect(segment).toHaveAttribute("data-pinned", "true", {
      timeout: 10_000,
    });

    const schedule = await riuna.api<{
      days: Array<{
        segments: Array<{
          type: string;
          taskId?: string;
          startSecond: number;
        }>;
      }>;
    }>("get", `/api/schedule?workspaceId=${riuna.workspaceId}&days=3`);

    const pinned = schedule.days
      .flatMap((day) => day.segments)
      .find((s) => s.type === "pinned" && s.taskId === taskId);

    expect(pinned).toBeTruthy();
    // 08:00 + ~60 min de arrastre, con margen por el redondeo de 5 min.
    expect(pinned?.startSecond).toBeGreaterThan(8 * 3600 + 40 * 60);
    expect(pinned?.startSecond).toBeLessThan(8 * 3600 + 80 * 60);
  });
});
