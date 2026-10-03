import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PersonalProjectItem } from "@/components/personal-project-item";
import { SidebarProvider } from "@/components/ui/sidebar";

const navigate = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  useRouterState: ({
    select,
  }: {
    select: (state: { location: { pathname: string } }) => string;
  }) => select({ location: { pathname: "/dashboard/workspace/ws-1/home" } }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

let personal: { id: string } | null = null;
let canCreateTasks = false;

vi.mock("@/hooks/queries/capture/use-inbox", () => ({
  useInbox: () => ({ data: personal }),
}));

vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({ canCreateTasks: () => canCreateTasks }),
}));

// `SidebarProvider` consulta el tamano de pantalla al montar, y jsdom no trae
// `matchMedia`.
beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
  navigate.mockReset();
  personal = null;
  canCreateTasks = false;
});

afterEach(() => {
  cleanup();
});

function renderItem() {
  return render(
    <SidebarProvider>
      <PersonalProjectItem workspaceId="ws-1" />
    </SidebarProvider>,
  );
}

/**
 * «Personal» en lo alto de «Proyectos» (ADR 051): antes «Bandeja», en el
 * espacio personal de la barra.
 */
describe("PersonalProjectItem", () => {
  // Se crea al primer uso, y solo puede crearlo quien crea tareas. Si ya
  // existe -le quitaron el permiso despues-, se sigue enseñando.
  it("se enseña a quien puede crear tareas o ya lo tiene", () => {
    renderItem();
    expect(screen.queryByText("navigation:sidebar.inbox")).toBeNull();
    cleanup();

    canCreateTasks = true;
    renderItem();
    screen.getByText("navigation:sidebar.inbox").click();
    expect(navigate).toHaveBeenCalledWith({
      to: "/dashboard/workspace/ws-1/inbox",
    });
    cleanup();

    canCreateTasks = false;
    personal = { id: "personal-1" };
    renderItem();
    expect(screen.getByText("navigation:sidebar.inbox")).toBeInTheDocument();
  });

  // Revision de codigo del interludio, hallazgo 8: ya creado, va directo a
  // su tablero. Pasar por `/inbox` pide crearlo, y eso exige crear tareas.
  it("lleva directo al proyecto que ya existe, sin pedir crearlo", () => {
    personal = { id: "personal-1" };
    renderItem();
    screen.getByText("navigation:sidebar.inbox").click();
    expect(navigate).toHaveBeenCalledWith({
      to: "/dashboard/workspace/ws-1/project/personal-1/board",
    });
  });
});
