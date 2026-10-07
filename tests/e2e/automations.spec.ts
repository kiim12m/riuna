import { addTeammate, createTask, expect, test } from "./fixtures";

type Column = { id: string; slug: string; isFinal: boolean };

/**
 * Las automatizaciones en pantalla (Fase 8, Bloque 3): crear una regla desde
 * una receta y verla actuar, programar el stand-up de un departamento y ver
 * por que se paro una regla.
 */
test.describe("Automatizaciones", () => {
  test("una regla nacida de una receta avisa al cerrar la tarea", async ({
    page,
    riuna,
  }) => {
    const columns = await riuna.api<Column[]>(
      "get",
      `/api/column/${riuna.projectId}`,
    );
    const done = columns.find((column) => column.isFinal);
    if (!done) throw new Error("The project has no done column");

    await page.goto(
      `/dashboard/workspace/${riuna.workspaceId}/admin/project-settings/${riuna.projectId}/automations`,
    );
    await page
      .getByRole("combobox", { name: "Empezar desde una receta…" })
      .click({ timeout: 30_000 });
    await page
      .getByRole("option", { name: "Al terminar, avisar a quien la creó" })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Nombre")).toHaveValue(
      "Al terminar, avisar a quien la creó",
    );
    await dialog.getByRole("button", { name: "Guardar" }).click();

    const row = page
      .getByTestId("automation-row")
      .filter({ hasText: "Al terminar, avisar a quien la creó" });
    await expect(row).toBeVisible();

    const taskId = await createTask(riuna, "Entregar memoria");
    await riuna.api("put", `/api/task/status/${taskId}`, { status: done.slug });
    await expect
      .poll(async () => {
        const notifications = await riuna.api<
          Array<{ type: string; content: string | null }>
        >("get", "/api/notification");
        return notifications
          .filter((notification) => notification.type === "automation")
          .map((notification) => notification.content);
      })
      .toEqual([expect.stringContaining("Entregar memoria está terminada")]);

    // Su ultima ejecucion se ve en la lista, y su historial la cuenta.
    await page.reload();
    await expect(row).toContainText("Hecha", { timeout: 30_000 });
    await row.getByRole("button", { name: /Historial de/ }).click();
    await expect(page.getByTestId("automation-runs")).toContainText(
      "Entregar memoria",
    );
  });

  test("el responsable programa el stand-up de su departamento a un chat", async ({
    page,
    riuna,
    browser,
    baseURL,
  }) => {
    const ana = await addTeammate({
      riuna,
      browser,
      origin: baseURL ?? "http://localhost:5174",
      name: "Ana",
    });
    const team = await riuna.api<{ id: string }>(
      "post",
      "/api/auth/organization/create-team",
      { name: "Obras", organizationId: riuna.workspaceId },
    );
    for (const userId of [riuna.userId, ana.id]) {
      await riuna.api("post", "/api/auth/organization/add-team-member", {
        teamId: team.id,
        userId,
      });
    }
    await riuna.api("put", `/api/team-lead?workspaceId=${riuna.workspaceId}`, {
      teamId: team.id,
      userId: riuna.userId,
      isLead: true,
    });

    await page.goto(`/dashboard/workspace/${riuna.workspaceId}/team`);
    await page.getByRole("button", { name: "Stand-up" }).click({
      timeout: 30_000,
    });
    const deliveries = page.getByTestId(`standup-schedule-${team.id}`);
    await deliveries.getByRole("button", { name: "Programar" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("leerá el stand-up de tu gente");
    await dialog
      .getByLabel("URL del webhook")
      .fill("https://hooks.slack.com/services/T000/B000/XXXXXXXX");
    await dialog.getByRole("button", { name: "Guardar" }).click();

    await expect(deliveries).toContainText("a las 09:30");
    const rules = await riuna.api<
      Array<{ trigger: { type: string; weekdays: number[] } }>
    >("get", `/api/automation/workspace/${riuna.workspaceId}/team/${team.id}`);
    expect(rules.map((rule) => rule.trigger)).toEqual([
      { type: "schedule", weekdays: [1, 2, 3, 4, 5], time: "09:30" },
    ]);
    await ana.context.close();
  });

  test("una regla cuyo autor pierde el permiso se pausa y lo dice", async ({
    page,
    riuna,
    browser,
    baseURL,
  }) => {
    const ana = await addTeammate({
      riuna,
      browser,
      origin: baseURL ?? "http://localhost:5174",
      name: "Ana",
    });
    const { members } = await riuna.api<{
      members: Array<{ id: string; userId: string }>;
    }>(
      "get",
      `/api/auth/organization/list-members?organizationId=${riuna.workspaceId}`,
    );
    const memberId = members.find((member) => member.userId === ana.id)?.id;
    const setRole = (role: string) =>
      riuna.api("post", "/api/auth/organization/update-member-role", {
        memberId,
        role,
        organizationId: riuna.workspaceId,
      });

    await setRole("admin");
    await ana.api("post", `/api/automation/project/${riuna.projectId}`, {
      name: "Todo urgente",
      trigger: { type: "task.created" },
      actions: [{ id: "a1", type: "priority", priority: "urgent" }],
    });
    await setRole("member");
    await createTask(riuna, "Llamar al cliente");

    await page.goto(
      `/dashboard/workspace/${riuna.workspaceId}/admin/project-settings/${riuna.projectId}/automations`,
    );
    const row = page
      .getByTestId("automation-row")
      .filter({ hasText: "Todo urgente" });
    await expect(row.getByRole("status")).toContainText(
      "ya no tiene el permiso",
      { timeout: 30_000 },
    );
    await expect(row.getByRole("switch")).not.toBeChecked();
    await ana.context.close();
  });
});
