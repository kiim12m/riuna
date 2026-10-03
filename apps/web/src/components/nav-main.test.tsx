import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NavMain } from "@/components/nav-main";
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

vi.mock("@/hooks/queries/workspace/use-active-workspace", () => ({
  default: () => ({ data: { id: "ws-1", name: "Servitec" } }),
}));

let counts: { today: number; myTasks: number } | undefined;

vi.mock("@/hooks/queries/my-work/use-my-work-counts", () => ({
  useMyWorkCounts: () => ({ data: counts }),
}));

let ledMembers: Array<{ id: string; name: string }> = [];

vi.mock("@/hooks/queries/lead/use-team", () => ({
  useTeamMembers: () => ({ data: ledMembers }),
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
});

function renderNav() {
  return render(
    <SidebarProvider>
      <NavMain />
    </SidebarProvider>,
  );
}

beforeEach(() => {
  navigate.mockReset();
  counts = { today: 7, myTasks: 34 };
  ledMembers = [];
});

afterEach(() => {
  cleanup();
});

describe("NavMain", () => {
  it("siempre ensena el espacio personal", () => {
    renderNav();

    expect(screen.getByText("navigation:sidebar.personal")).toBeInTheDocument();
    expect(screen.getByText("navigation:sidebar.today")).toBeInTheDocument();
    expect(screen.getByText("navigation:sidebar.planner")).toBeInTheDocument();
    expect(screen.getByText("navigation:sidebar.schedule")).toBeInTheDocument();
    expect(screen.getByText("navigation:sidebar.myTasks")).toBeInTheDocument();
    expect(
      screen.getByText("navigation:sidebar.timeSheet"),
    ).toBeInTheDocument();
    expect(screen.getByText("navigation:sidebar.home")).toBeInTheDocument();
    expect(screen.getByText("navigation:sidebar.goals")).toBeInTheDocument();
  });

  // La administracion se fue al menu del avatar (`useAdminNavItems`) para
  // limpiar la barra: ni con todas las capacidades sale aqui.
  it("ya no ensena el grupo de administracion", () => {
    renderNav();

    expect(screen.queryByText("navigation:sidebar.admin")).toBeNull();
    expect(screen.queryByText("navigation:sidebar.membersAndTeams")).toBeNull();
  });

  it("ensena los contadores de Hoy y Mis tareas", () => {
    renderNav();

    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("34")).toBeInTheDocument();
  });

  // Un "0" en el badge de "Hoy" leeria como "ya se sabe que no hay nada
  // pendiente", cuando en realidad puede que la consulta ni haya respondido
  // todavia: se oculta el badge entero en vez de ensenar un cero.
  it("oculta el badge de un contador en cero", () => {
    counts = { today: 0, myTasks: 5 };
    renderNav();

    expect(screen.queryByText("0")).toBeNull();
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  // «Mi equipo» es la vista del responsable de departamento (ADR 059): quien
  // no lleva a nadie no la ve.
  it("ensena «Mi equipo» solo a quien lleva a alguien", () => {
    renderNav();
    expect(screen.queryByText("navigation:sidebar.team")).toBeNull();
    cleanup();

    ledMembers = [{ id: "user-2", name: "Ana" }];
    renderNav();
    expect(screen.getByText("navigation:sidebar.team")).toBeInTheDocument();
  });
});
