import { expect, test } from "./fixtures";

/** `yyyy-mm-dd` en hora local. */
function localDay(offsetDays: number) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

type PlanEntry = {
  id: string;
  title: string;
  plannedDate: string;
  startMinute: number | null;
  estimate: number | null;
};

/**
 * Captura rapida (sub-bloque 1.2 del interludio de productividad, ADR 052):
 * una linea se convierte en tarea, con su vista previa, desde Hoy y desde la
 * tecla `q` en cualquier pantalla.
 */
test.describe("Captura rápida", () => {
  test("desde Hoy, la tarea va a Personal y al plan de hoy", async ({
    page,
    riuna,
  }) => {
    await riuna.api("post", "/api/label", {
      name: "Cliente",
      color: "blue",
      workspaceId: riuna.workspaceId,
    });

    await page.goto(`/dashboard/workspace/${riuna.workspaceId}/today`);

    // La chuleta de la sintaxis no va a la vista: sale del «?», al pasar el
    // raton, y pulsarlo la deja abierta.
    const help = page.getByTestId("quick-add-help");
    const helpButton = page.getByRole("button", {
      name: "Ayuda de la captura",
    });
    await expect(helpButton).toBeVisible({ timeout: 30_000 });
    await expect(help).toBeHidden();
    await helpButton.hover();
    await expect(help).toContainText("@día la planifica");
    await page.mouse.move(0, 0);
    await expect(help).toBeHidden();
    await helpButton.click();
    await page.mouse.move(0, 0);
    await expect(help).toContainText("+CLAVE proyecto");
    await page.keyboard.press("Escape");
    await expect(help).toBeHidden();

    const input = page.getByTestId("quick-add-input");
    await input.fill("Llamar al proveedor 1h30 #cliente *alta");

    const preview = page.getByTestId("quick-add-preview");
    await expect(preview).toContainText("Personal");
    await expect(preview).toContainText("1,5 h");
    await expect(preview).toContainText("Cliente");
    await expect(preview).toContainText("Alta");

    await input.press("Enter");
    await expect(page.getByText(/PER-1 capturada en Personal/)).toBeVisible();
    await expect(input).toHaveValue("");

    const today = await riuna.api<{ planned: PlanEntry[] }>(
      "get",
      `/api/today?workspaceId=${riuna.workspaceId}`,
    );
    const captured = today.planned.find(
      (entry) => entry.title === "Llamar al proveedor",
    );
    expect(captured?.estimate).toBe(5400);
    await expect(
      page.locator(`[data-testid="today-row-${captured?.id}"]`),
    ).toBeVisible();
  });

  test("la tecla q captura desde cualquier pantalla, con día, hora y proyecto, sin vencimiento", async ({
    page,
    riuna,
  }) => {
    await page.goto(`/dashboard/workspace/${riuna.workspaceId}/time-sheet`);
    // «Personal» sale en la barra cuando ya se sabe que se pueden crear
    // tareas, que es lo mismo que espera `q`.
    await page
      .getByRole("button", { name: "Personal", exact: true })
      .waitFor({ timeout: 30_000 });

    // Fuera de cualquier caja de texto.
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("q");
    const dialog = page.getByRole("dialog", { name: "Captura rápida" });
    await expect(dialog).toBeVisible();

    await dialog
      .getByTestId("quick-add-input")
      .fill(`Revisar presupuesto @mañana 10:00 +${riuna.projectSlug}`);
    await expect(dialog.getByTestId("quick-add-preview")).toContainText(
      "Proyecto E2E",
    );
    await dialog.getByTestId("quick-add-input").press("Enter");
    await expect(dialog).toBeHidden();

    const tomorrow = localDay(1);
    await page.goto(`/dashboard/workspace/${riuna.workspaceId}/planner`);
    await expect(
      page
        .getByTestId(`planner-timed-${tomorrow}`)
        .getByText("Revisar presupuesto"),
    ).toBeVisible();

    const plan = await riuna.api<{ entries: PlanEntry[] }>(
      "get",
      `/api/planner?workspaceId=${riuna.workspaceId}`,
    );
    const entry = plan.entries.find(
      (candidate) => candidate.title === "Revisar presupuesto",
    );
    expect(entry?.startMinute).toBe(600);

    const task = await riuna.api<{ dueDate: string | null; projectId: string }>(
      "get",
      `/api/task/${entry?.id}`,
    );
    expect(task.dueDate).toBeNull();
    expect(task.projectId).toBe(riuna.projectId);
  });
});
