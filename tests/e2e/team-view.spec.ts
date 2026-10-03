import { addTeammate, createTask, expect, test } from "./fixtures";

function todayKey() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * «Mi equipo» (sub-bloque 5.3 del interludio de productividad, ADR 059): el
 * responsable ve el dia y el stand-up de su gente, sin poder cambiar nada.
 */
test.describe("Mi equipo", () => {
  test("el responsable ve el día y el stand-up de su gente, en solo lectura", async ({
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

    // Ana planifica su dia con su propia sesion.
    const taskId = await createTask(riuna, "Revisar planos");
    await riuna.api("put", `/api/task/assignee/${taskId}`, { userId: ana.id });
    await ana.api(
      "put",
      `/api/planner/${taskId}?workspaceId=${riuna.workspaceId}`,
      { plannedDate: todayKey(), startMinute: 10 * 60 },
    );

    await page.goto(`/dashboard/workspace/${riuna.workspaceId}/today`);
    await page.getByRole("button", { name: "Mi equipo" }).click({
      timeout: 30_000,
    });
    const card = page.getByTestId(`team-member-${ana.id}`);
    await expect(card).toContainText("Ana", { timeout: 30_000 });
    await expect(card).toContainText("10:00");
    await expect(card).toContainText("Revisar planos");
    await expect(card).toContainText("Aún no ha cerrado el día.");
    // Solo lectura: nada que pulsar en la tarjeta.
    await expect(card.getByRole("button")).toHaveCount(0);

    await page.getByRole("button", { name: "Stand-up" }).click();
    await expect(page.getByTestId(`team-standup-${ana.id}`)).toContainText(
      "Revisar planos",
    );
    await ana.context.close();
  });
});
