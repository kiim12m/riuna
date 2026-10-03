import { expect, test } from "./fixtures";

/**
 * «Personal», antes «Bandeja» (sub-bloque 1.1 del interludio de
 * productividad, ADR 051): un proyecto por persona, oculto en las listas de
 * proyectos de los demas pero no privado. Se crea al primer uso, desde su
 * entrada fija en lo alto de «Proyectos».
 */
test.describe("Personal", () => {
  test("se crea al primer uso, no sale en las listas y avisa de que no es privada", async ({
    page,
    riuna,
  }) => {
    const before = await riuna.api<{ inbox: { id: string } | null }>(
      "get",
      `/api/capture/inbox?workspaceId=${riuna.workspaceId}`,
    );
    expect(before.inbox).toBeNull();

    await page.goto(`/dashboard/workspace/${riuna.workspaceId}/today`);
    const entry = page.getByRole("button", { name: "Personal", exact: true });
    await entry.click({ timeout: 30_000 });

    await expect(page).toHaveURL(/\/project\/[^/]+\/board/);
    const inboxId = page.url().match(/\/project\/([^/]+)\//)?.[1];
    await expect(page.getByText("Personal de E2E").first()).toBeVisible();
    await expect(entry).toHaveAttribute("data-active", "true");

    const after = await riuna.api<{ inbox: { id: string } | null }>(
      "get",
      `/api/capture/inbox?workspaceId=${riuna.workspaceId}`,
    );
    expect(after.inbox?.id).toBe(inboxId);

    const projects = await riuna.api<{ id: string }[]>(
      "get",
      `/api/project?workspaceId=${riuna.workspaceId}`,
    );
    expect(projects.map((project) => project.id)).toEqual([riuna.projectId]);

    await page.getByRole("button", { name: "Quién ve Personal" }).click();
    await expect(page.getByText(/pero no es privado/)).toBeVisible();

    // Volver a entrar lleva a la misma, no crea otra.
    await page.goto(`/dashboard/workspace/${riuna.workspaceId}/planner`);
    await entry.click();
    await expect(page).toHaveURL(new RegExp(`/project/${inboxId}/board`));
  });
});
