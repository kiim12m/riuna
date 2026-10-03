import { createTask, expect, test } from "./fixtures";

function keyOf(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

type Recorded = { title: string; body: string; tag: string };

/**
 * Avisos a la hora anclada (sub-bloque 3.1 del interludio de productividad,
 * ADR 055). `Notification` se sustituye por una que solo apunta lo que se
 * avisa, y el reloj de la pagina se adelanta en vez de esperar.
 */
test.describe("Avisos del navegador", () => {
  test("avisa a la hora anclada, pospone diez minutos y empieza desde el aviso", async ({
    page,
    riuna,
  }) => {
    const now = new Date();
    test.skip(
      now.getHours() >= 23,
      "La hora anclada de la prueba caeria al dia siguiente",
    );
    const startMinute = now.getHours() * 60 + now.getMinutes() + 2;

    const taskId = await createTask(riuna, "Llamar al proveedor");
    await riuna.api("put", `/api/task/assignee/${taskId}`, {
      userId: riuna.userId,
    });
    await riuna.api(
      "put",
      `/api/planner/${taskId}?workspaceId=${riuna.workspaceId}`,
      { plannedDate: keyOf(now), startMinute },
    );

    await page.addInitScript(() => {
      const recorded: Array<{
        title: string;
        body: string;
        tag: string;
        onclick: (() => void) | null;
      }> = [];
      class FakeNotification {
        static permission = "granted";
        static requestPermission = async () => "granted";
        title: string;
        body: string;
        tag: string;
        onclick: (() => void) | null = null;
        constructor(title: string, options: { body: string; tag: string }) {
          this.title = title;
          this.body = options.body;
          this.tag = options.tag;
          recorded.push(this);
        }
        close() {}
      }
      Object.assign(window, {
        Notification: FakeNotification,
        __notifications: recorded,
      });
    });
    await page.clock.install({ time: now });

    const recorded = () =>
      page.evaluate(() =>
        (
          (window as unknown as { __notifications: Recorded[] })
            .__notifications ?? []
        ).map(({ title, body, tag }) => ({ title, body, tag })),
      );
    const clickLast = () =>
      page.evaluate(() => {
        const list = (
          window as unknown as { __notifications: { onclick: () => void }[] }
        ).__notifications;
        list[list.length - 1]?.onclick();
      });

    await page.goto("/dashboard/settings/account/preferences");
    const toggle = page.getByRole("switch", {
      name: "Avisarme en este navegador",
    });
    await toggle.click({ timeout: 30_000 });
    await expect(toggle).toBeChecked();

    await page.goto(`/dashboard/workspace/${riuna.workspaceId}/today`);
    await page.getByTestId(`today-row-${taskId}`).waitFor({ timeout: 30_000 });
    expect(await recorded()).toEqual([]);

    await page.clock.fastForward("03:00");
    await expect.poll(recorded).toHaveLength(1);
    expect((await recorded())[0]).toMatchObject({
      title: "Es la hora",
      body: expect.stringContaining("Llamar al proveedor"),
    });

    await clickLast();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Llamar al proveedor");
    await dialog.getByRole("button", { name: "Posponer 10 min" }).click();
    await expect(dialog).toBeHidden();

    await page.clock.fastForward("05:00");
    expect(await recorded()).toHaveLength(1);
    await page.clock.fastForward("06:00");
    await expect.poll(recorded).toHaveLength(2);

    await clickLast();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Empezar" })
      .click();
    await expect
      .poll(async () => {
        const running = await riuna.api<{
          running: { task: { id: string } } | null;
        }>("get", `/api/time-entry/running?workspaceId=${riuna.workspaceId}`);
        return running.running?.task.id;
      })
      .toBe(taskId);
  });
});
