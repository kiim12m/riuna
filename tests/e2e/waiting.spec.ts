import { createTask, expect, test } from "./fixtures";

/**
 * «Esperando a» (sub-bloque 1.4 del interludio de productividad): lo mio
 * bloqueado por una tarea ajena sale con la que lo bloquea, y deja de salir
 * cuando esa se termina.
 */
test.describe("Esperando a", () => {
  test("enseña lo mío bloqueado por otra tarea, con cuál", async ({
    page,
    riuna,
  }) => {
    const mine = await createTask(riuna, "Montar el cuadro");
    await riuna.api("put", `/api/task/assignee/${mine}`, {
      userId: riuna.userId,
    });
    // Sin asignar: no es mia, asi que espero a que alguien la haga.
    const blocker = await createTask(riuna, "Pedir el material");
    await riuna.api("post", "/api/task-relation", {
      sourceTaskId: blocker,
      targetTaskId: mine,
      relationType: "blocks",
    });

    await page.goto(`/dashboard/workspace/${riuna.workspaceId}/my-tasks/list`);
    await page
      .getByRole("button", { name: "Esperando a", exact: true })
      .click({ timeout: 30_000 });
    await expect(page).toHaveURL(/my-tasks\/waiting/);

    const blocked = page.getByTestId("waiting-blocked");
    await expect(blocked).toContainText("Montar el cuadro");
    await expect(blocked).toContainText(/Bloqueada por .*Pedir el material/);

    await riuna.api("post", `/api/task/complete/${blocker}`, { done: true });
    await page.reload();
    await expect(
      page.getByText("No esperas a nadie", { exact: true }),
    ).toBeVisible({ timeout: 30_000 });
  });
});
