import { addTeammate, expect, test } from "./fixtures";

/**
 * El responsable de departamento (sub-bloque 5.2 del interludio de
 * productividad, ADR 059): quien administra lo marca en el diálogo del
 * equipo, y el resto del equipo lo ve avisado en Hoy y en el Planificador.
 */
test.describe("Responsable de departamento", () => {
  test("se marca en el equipo y los demás lo ven avisado", async ({
    page,
    riuna,
    browser,
    baseURL,
  }) => {
    const origin = baseURL ?? "http://localhost:5174";
    const ana = await addTeammate({ riuna, browser, origin, name: "Ana" });
    const anaPage = ana.page;
    const anaId = ana.id;

    const team = await riuna.api<{ id: string }>(
      "post",
      "/api/auth/organization/create-team",
      { name: "Obras", organizationId: riuna.workspaceId },
    );
    for (const userId of [riuna.userId, anaId]) {
      await riuna.api("post", "/api/auth/organization/add-team-member", {
        teamId: team.id,
        userId,
      });
    }

    // Antes de marcar a nadie, Ana no tiene aviso.
    await anaPage.goto(`/dashboard/workspace/${riuna.workspaceId}/today`);
    await anaPage.getByRole("heading", { name: "Hoy" }).waitFor({
      timeout: 30_000,
    });
    await expect(anaPage.getByTestId("lead-notice")).toHaveCount(0);

    await page.goto(
      `/dashboard/workspace/${riuna.workspaceId}/admin/workspace/teams`,
    );
    // La fila del equipo: el antecesor mas cercano de su nombre que tenga
    // su boton de miembros.
    await page
      .getByText("Obras", { exact: true })
      .locator("xpath=ancestor::*[.//button[normalize-space()='Miembros']][1]")
      .getByRole("button", { name: "Miembros" })
      .click({ timeout: 30_000 });
    const lead = page.getByRole("switch", {
      name: "Responsable del equipo: E2E",
    });
    await lead.click();
    await expect(lead).toBeChecked();
    await expect
      .poll(() =>
        riuna.api<{ teamId: string; userId: string }[]>(
          "get",
          `/api/team-lead?workspaceId=${riuna.workspaceId}`,
        ),
      )
      .toEqual([{ teamId: team.id, userId: riuna.userId }]);

    await anaPage.reload();
    await expect(anaPage.getByTestId("lead-notice")).toHaveText(
      "Tu responsable, E2E, ve tu plan y tus cierres, nunca tu valoración.",
      { timeout: 30_000 },
    );
    await ana.context.close();
  });
});
