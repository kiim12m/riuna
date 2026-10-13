import { createTask, expect, test } from "./fixtures";

/** El mismo calculo de "manana" que usan las pruebas de integracion: evita
 * que la asercion dependa de la hora real a la que corre esto (ADR 041, el
 * reparto de "hoy" arranca en `max(inicio de jornada, ahora)`). */
function tomorrow(): Date {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(0, 0, 0, 0);
  return date;
}

function tomorrowIso() {
  return tomorrow().toISOString();
}

/** `yyyy-mm-dd` local, como `dayKey()` de `schedule-range.ts`: la vista Dia
 * por defecto es la semana natural, que no siempre incluye "manana" -si hoy
 * es el ultimo dia de la semana, cae en la semana siguiente-, asi que la
 * prueba navega explicita al dia planificado en vez de fiarse del ancla por
 * defecto. */
function tomorrowDayKey(): string {
  const date = tomorrow();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** El lunes de la semana que corre ahora, en hora local -como `dayKey()` de
 * `schedule-range.ts`-. Bajo `weekStartsOn: 0` (domingo, el valor por
 * defecto de la preferencia), lunes y martes caen siempre dentro de la misma
 * semana natural sea cual sea "hoy", a diferencia de "manana", que puede
 * cruzar a la semana siguiente. */
function mondayOfThisWeek(): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  const diffToMonday = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - diffToMonday);
  return date;
}

function toDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

    await page.goto(
      `/dashboard/workspace/${riuna.workspaceId}/schedule?view=day&date=${tomorrowDayKey()}`,
    );

    const segment = page.getByTestId(`schedule-segment-${taskId}`);
    await expect(segment).toBeVisible({ timeout: 20_000 });
    await expect(segment).toHaveAttribute("data-pinned", "false");
    // `toBeVisible` no exige estar dentro del area visible del scroll propio
    // de la rejilla; sin esto, si "manana" resulta ser "hoy" (media noche de
    // por medio), el reencuadre a la hora actual podria dejar el tramo fuera
    // del viewport y el arrastre no tocaria nada.
    // Al centro y no al borde: la cabecera de los dias es fija y tapa lo
    // que `scrollIntoViewIfNeeded` deja justo arriba, que es donde cae una
    // tarea de primera hora cuando el Cronograma abre ya pasada esa hora.
    await segment.evaluate((element) =>
      element.scrollIntoView({ block: "center" }),
    );

    const box = await segment.boundingBox();
    if (!box) throw new Error("No se pudo medir el tramo");

    // No `dragTo`: el arrastre escucha eventos de puntero, no HTML5 nativo.
    // El origen es el centro vertical del tramo, no un punto fijo cerca del
    // borde: las nanses de redimensionar (`segment-card.tsx`) ocupan los 6 px
    // superiores e inferiores, y agarrar ahi resimensionaria en vez de mover.
    const originY = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width / 2, originY);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, originY + 42, {
      steps: 6,
    });
    await page.mouse.move(box.x + box.width / 2, originY + 84, {
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
    // 09:00 (inicio de jornada por defecto, ADR 045) + ~60 min de arrastre,
    // con margen por el redondeo de 5 min.
    expect(pinned?.startSecond).toBeGreaterThan(9 * 3600 + 40 * 60);
    expect(pinned?.startSecond).toBeLessThan(9 * 3600 + 80 * 60);
  });

  test("creates and plans a task by clicking an empty slot", async ({
    page,
    riuna,
  }) => {
    const dayKey = tomorrowDayKey();
    const title = `Revisar planos ${Date.now()}`;

    await page.goto(
      `/dashboard/workspace/${riuna.workspaceId}/schedule?view=day&date=${dayKey}`,
    );

    const column = page.getByTestId(`schedule-column-${dayKey}`);
    await expect(column).toBeVisible({ timeout: 20_000 });

    // Mediodia, bien dentro de la jornada laboral por defecto (09:00-17:00,
    // ADR 045): 12h * 60min * 1.4 px/min (`PX_PER_MINUTE`), relativo al
    // propio fondo de la columna -que arranca en minuto 0, sin el offset de
    // la cabecera-. `position` deja que Playwright desplace la rejilla -de
    // 24h, mas alta que la ventana- hasta que el punto sea visible, en vez
    // de calcular el scroll a mano.
    const trigger = page.getByTestId(`schedule-slot-trigger-${dayKey}`);
    await trigger.click({ position: { x: 50, y: 12 * 60 * 1.4 } });

    const input = page.getByTestId("schedule-slot-input");
    await expect(input).toBeVisible({ timeout: 5_000 });
    await input.fill(title);
    await input.press("Enter");

    await expect(page.getByText(title, { exact: true })).toBeVisible({
      timeout: 10_000,
    });

    // Crear desde un hueco son dos peticiones -la tarea y luego su hora-, y
    // el titulo ya se ve con la segunda en vuelo: se espera a que la API la
    // tenga anclada en vez de leerla una sola vez.
    const pinnedSegment = async () => {
      const schedule = await riuna.api<{
        days: Array<{
          dayDate: string;
          segments: Array<{
            type: string;
            startSecond: number;
            task?: { title: string } | null;
          }>;
        }>;
      }>(
        "get",
        `/api/schedule?workspaceId=${riuna.workspaceId}&from=${dayKey}&days=1`,
      );
      return schedule.days[0]?.segments.find(
        (s) => s.type === "pinned" && s.task?.title === title,
      );
    };
    await expect.poll(pinnedSegment).toBeTruthy();
    const created = await pinnedSegment();
    // Redondeado a 15 min (`CREATE_SNAP_MINUTES`): 11:52:30-12:07:30.
    expect(created?.startSecond).toBeGreaterThan(11 * 3600 + 52 * 60);
    expect(created?.startSecond).toBeLessThan(12 * 3600 + 8 * 60);
  });

  test("resizes a task's duration by dragging its bottom edge", async ({
    page,
    riuna,
  }) => {
    const dayKey = tomorrowDayKey();
    const taskId = await createTask(riuna, "Rejuntar azulejos", {
      estimate: 1800, // 30 min
    });
    await riuna.api("put", `/api/task/assignee/${taskId}`, {
      userId: riuna.userId,
    });
    await riuna.api(
      "put",
      `/api/planner/${taskId}?workspaceId=${riuna.workspaceId}`,
      { plannedDate: tomorrowIso(), position: 0 },
    );

    await page.goto(
      `/dashboard/workspace/${riuna.workspaceId}/schedule?view=day&date=${dayKey}`,
    );

    const segment = page.getByTestId(`schedule-segment-${taskId}`);
    await expect(segment).toBeVisible({ timeout: 20_000 });
    // Al centro y no al borde: la cabecera de los dias es fija y tapa lo
    // que `scrollIntoViewIfNeeded` deja justo arriba, que es donde cae una
    // tarea de primera hora cuando el Cronograma abre ya pasada esa hora.
    await segment.evaluate((element) =>
      element.scrollIntoView({ block: "center" }),
    );
    const box = await segment.boundingBox();
    if (!box) throw new Error("No se pudo medir el tramo");

    // Agarra la nansa inferior (los 6 px de abajo del tramo) y arrastra 30 px
    // hacia abajo: 30px / 1.4 px-por-min ~= 21 min, redondeados a 20
    // (`SNAP_MINUTES`). 30 min + 20 = 50 min de nueva duracion.
    await page.mouse.move(box.x + box.width / 2, box.y + box.height - 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height - 2 + 30, {
      steps: 6,
    });
    await page.mouse.up();

    // El cambio se guarda despues de soltar: leerlo en el acto podia llegar
    // antes que el (en el simulacro salia la duracion de antes).
    await expect
      .poll(async () => {
        const task = await riuna.api<{ estimate: number | null }>(
          "get",
          `/api/task/${taskId}`,
        );
        return task.estimate;
      })
      .toBe(1800 + 20 * 60);
  });

  test("moves a task to another day by dragging it across columns", async ({
    page,
    riuna,
  }) => {
    const monday = mondayOfThisWeek();
    const mondayKey = toDayKey(monday);
    const tuesday = new Date(monday);
    tuesday.setDate(tuesday.getDate() + 1);
    const tuesdayKey = toDayKey(tuesday);

    const taskId = await createTask(riuna, "Encargar azulejos", {
      estimate: 1800,
    });
    await riuna.api("put", `/api/task/assignee/${taskId}`, {
      userId: riuna.userId,
    });
    // Anclada de entrada (09:00 en lunes): posicion determinista antes de
    // arrastrar, sin depender de donde caiga en el reparto por flujo.
    await riuna.api(
      "put",
      `/api/planner/${taskId}?workspaceId=${riuna.workspaceId}`,
      { plannedDate: monday.toISOString(), position: 0, startMinute: 9 * 60 },
    );

    await page.goto(
      `/dashboard/workspace/${riuna.workspaceId}/schedule?view=week&date=${mondayKey}`,
    );

    const segment = page.getByTestId(`schedule-segment-${taskId}`);
    await expect(segment).toBeVisible({ timeout: 20_000 });
    // `toBeVisible` no exige estar dentro del area visible del contenedor
    // con scroll propio (`overflow-auto` en `TimeGrid`): el miercoles de esta
    // semana es "hoy", asi que el reencuadre inicial salta a la hora actual,
    // que puede caer muy por debajo de las 09:00 donde esta anclada la
    // tarea. Sin desplazarla a la vista, `boundingBox()` devuelve una `y`
    // fuera del viewport y el arrastre no toca nada.
    // Al centro y no al borde: la cabecera de los dias es fija y tapa lo
    // que `scrollIntoViewIfNeeded` deja justo arriba, que es donde cae una
    // tarea de primera hora cuando el Cronograma abre ya pasada esa hora.
    await segment.evaluate((element) =>
      element.scrollIntoView({ block: "center" }),
    );
    const box = await segment.boundingBox();
    if (!box) throw new Error("No se pudo medir el tramo");

    const targetColumn = page.getByTestId(`schedule-column-${tuesdayKey}`);
    await expect(targetColumn).toBeVisible();
    const targetBox = await targetColumn.boundingBox();
    if (!targetBox) throw new Error("No se pudo medir la columna destino");

    const originY = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width / 2, originY);
    await page.mouse.down();
    // Misma altura, pero centrado en la columna del martes: el minuto no
    // deberia cambiar (mismo eje Y), solo el dia.
    await page.mouse.move(targetBox.x + targetBox.width / 2, originY, {
      steps: 8,
    });

    // Con el puntero aun sobre el martes: se ve la sombra de destino
    // (`drag-ghost.tsx`) y en ninguna columna sale la casilla de crear
    // tarea -las dos cosas que se confundian antes de este cambio.
    await expect(targetColumn.getByTestId("schedule-drag-ghost")).toBeVisible();
    await expect(page.getByTestId("schedule-create-placeholder")).toHaveCount(
      0,
    );

    await page.mouse.up();

    // La cache optimista (`use-schedule-mutations.ts`) mueve el tramo a la
    // columna de destino en el mismo tick que se suelta, sin esperar al
    // refetch: comprobarlo aqui, antes de ir a la API, es lo que distingue
    // esto de un salto tras el `onSettled`.
    await expect(
      targetColumn.getByTestId(`schedule-segment-${taskId}`),
    ).toBeVisible();

    // Lo optimista ya se ve; el cambio se guarda despues, asi que se espera
    // a que la API lo tenga (en el simulacro llegaba a leerse antes).
    type Segment = { type: string; taskId?: string; startSecond: number };
    let moved: Segment | undefined;
    await expect
      .poll(async () => {
        const nextDay = await riuna.api<{
          days: Array<{ segments: Segment[] }>;
        }>(
          "get",
          `/api/schedule?workspaceId=${riuna.workspaceId}&from=${tuesdayKey}&days=1`,
        );
        moved = nextDay.days[0]?.segments.find(
          (s) => s.type === "pinned" && s.taskId === taskId,
        );
        return Boolean(moved);
      })
      .toBe(true);
    // Sigue en torno a las 09:00, con margen por el redondeo de 5 min.
    expect(moved?.startSecond).toBeGreaterThan(8 * 3600 + 50 * 60);
    expect(moved?.startSecond).toBeLessThan(9 * 3600 + 10 * 60);

    const mondayStill = await riuna.api<{
      days: Array<{ segments: Array<{ taskId?: string }> }>;
    }>(
      "get",
      `/api/schedule?workspaceId=${riuna.workspaceId}&from=${mondayKey}&days=1`,
    );
    expect(mondayStill.days[0]?.segments.some((s) => s.taskId === taskId)).toBe(
      false,
    );
  });
});
