import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImportWizard } from "./import-wizard";

const analyze = vi.fn(async () => ({ source: "excel", columns: [] }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  // El arranque de i18n lo importa el `setup.ts` de las pruebas.
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@/hooks/mutations/task/use-analyze-import", () => ({
  default: () => ({ mutateAsync: analyze, isPending: false }),
}));

vi.mock("@/hooks/mutations/task/use-import-tasks", () => ({
  default: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ImportWizard", () => {
  // El boton "Seleccionar fichero" abria un campo que nadie pintaba: sin el,
  // importar solo se podia arrastrando y con el teclado no se podia.
  it("has the file input its button opens", async () => {
    // El dialogo se pinta en un portal, fuera del contenedor de `render`.
    render(<ImportWizard projectId="project-1" open onOpenChange={vi.fn()} />);

    const input =
      document.body.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();

    const file = new File(["a,b"], "tareas.csv", { type: "text/csv" });
    fireEvent.change(input as HTMLInputElement, { target: { files: [file] } });

    expect(analyze).toHaveBeenCalledWith({ projectId: "project-1", file });
    expect(
      screen.getByText("settings:tasksImportExport.selectFile"),
    ).toBeTruthy();
  });
});
