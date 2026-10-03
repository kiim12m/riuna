import { createTask, expect, test } from "./fixtures";

type Recorded = { title: string; body: string; tag: string };

/**
 * Avisos de ritmo (sub-bloque 3.3 del interludio de productividad, ADR 056).
 * Como en los avisos a la hora anclada, `Notification` se sustituye por una
 * que solo apunta lo que se avisa, y el reloj de la pagina se adelanta. La
 * jornada se ajusta alrededor de la hora real para no depender de cuando se
 * ejecute.
 */
test.describe("Avisos de ritmo", () => {
  test("avisa de que no se registra en la jornada y del cronómetro pasada la hora de salida", async ({
    page,
    riuna,
  }) => {
    const now = new Date();
    const minute = now.getHours() * 60 + now.getMinutes();
    test.skip(
      minute < 60 || minute >= 22 * 60,
      "La jornada de la prueba no cabe en el dia",
    );

    const taskId = await createTask(riuna, "Redactar informe");
    // La jornada empezo hace una hora y acaba dentro de una: sin cronometro
    // desde el principio, ya toca el aviso de registrar.
    await riuna.api("put", "/api/work-schedule", {
      workStartMinute: minute - 60,
      workEndMinute: minute + 60,
      lunchEnabled: false,
      lunchStartMinute: null,
      lunchEndMinute: null,
      workDays: 0b1_111_111,
    });

    // Lo avisado se apunta en `sessionStorage`: el runtime vive en todo el
    // panel, asi que el primer aviso ya llega en los ajustes, antes de
    // recargar la pagina.
    await page.addInitScript(() => {
      class FakeNotification {
        static permission = "granted";
        static requestPermission = async () => "granted";
        onclick: (() => void) | null = null;
        constructor(title: string, options: { body: string; tag: string }) {
          const recorded = JSON.parse(
            sessionStorage.getItem("e2e:notifications") ?? "[]",
          );
          recorded.push({ title, body: options.body, tag: options.tag });
          sessionStorage.setItem("e2e:notifications", JSON.stringify(recorded));
        }
        close() {}
      }
      Object.assign(window, { Notification: FakeNotification });
    });
    await page.clock.install({ time: now });

    const titles = () =>
      page.evaluate(() =>
        (
          JSON.parse(
            sessionStorage.getItem("e2e:notifications") ?? "[]",
          ) as Recorded[]
        ).map(({ title }) => title),
      );

    await page.goto("/dashboard/settings/account/preferences");
    const idle = page.getByRole("switch", { name: /^Sin registrar/ });
    // Sin los avisos del navegador no se pueden elegir.
    await expect(idle).toBeDisabled({ timeout: 30_000 });
    await page
      .getByRole("switch", { name: "Avisarme en este navegador" })
      .click();
    await idle.click();
    await page.getByRole("switch", { name: /^Fuera de jornada/ }).click();
    await expect(idle).toBeChecked();
    await expect.poll(titles).toEqual(["No estás registrando"]);

    // Como mucho uno por hora, tambien tras recargar.
    await page.goto(`/dashboard/workspace/${riuna.workspaceId}/today`);
    await page.getByRole("button", { name: "Personal", exact: true }).waitFor();
    await page.clock.fastForward("10:00");
    expect(await titles()).toEqual(["No estás registrando"]);

    await riuna.api("post", "/api/time-entry/start", { taskId });
    // El canal de usuario trae el cronometro a la barra lateral.
    await expect(
      page.getByTitle("Redactar informe", { exact: true }).first(),
    ).toBeVisible();
    // Pasada la hora de salida, con el cronometro en marcha.
    await page.clock.fastForward("55:00");
    await expect
      .poll(titles)
      .toEqual(["No estás registrando", "Tu jornada ha terminado"]);
  });
});
