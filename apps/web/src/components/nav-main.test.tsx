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

let projects: Array<{ id: string; name: string }> = [];

vi.mock("@/hooks/queries/project/use-get-projects", () => ({
  default: () => ({ data: projects }),
}));

const capabilities = {
  canManageWorkspace: false,
  canManageProjects: false,
  canManageTeam: false,
  canInviteUsers: false,
};

vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({
    canManageWorkspace: () => capabilities.canManageWorkspace,
    canManageProjects: () => capabilities.canManageProjects,
    canManageTeam: () => capabilities.canManageTeam,
    canInviteUsers: () => capabilities.canInviteUsers,
  }),
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
  projects = [{ id: "project-1", name: "Obra Norte" }];
  for (const key of Object.keys(capabilities) as Array<
    keyof typeof capabilities
  >) {
    capabilities[key] = false;
  }
});

afterEach(() => {
  cleanup();
});

describe("NavMain", () => {
  it("siempre ensena el espacio personal", () => {
    renderNav();

    expect(screen.getByText("navigation:sidebar.personal")).toBeInTheDocument();
    expect(screen.getByText("navigation:sidebar.home")).toBeInTheDocument();
    expect(screen.getByText("navigation:sidebar.goals")).toBeInTheDocument();
  });

  // La comprobacion que justifica el grupo: quien no administra nada no ve ni
  // la etiqueta. El grupo entero se omite, no se ensena vacio.
  it("oculta el grupo de administracion sin ninguna capacidad", () => {
    renderNav();

    expect(screen.queryByText("navigation:sidebar.admin")).toBeNull();
    expect(screen.queryByText("navigation:sidebar.projects")).toBeNull();
    expect(screen.queryByText("navigation:sidebar.membersAndTeams")).toBeNull();
  });

  // Cada entrada tiene su propia puerta: quien solo puede invitar ve miembros
  // y nada mas. Ensenar el bloque entero a quien tiene una sola capacidad
  // seria prometer pantallas que la API le va a negar.
  it("ensena solo las entradas cuya capacidad se tiene", () => {
    capabilities.canInviteUsers = true;
    renderNav();

    expect(screen.getByText("navigation:sidebar.admin")).toBeInTheDocument();
    expect(
      screen.getByText("navigation:sidebar.membersAndTeams"),
    ).toBeInTheDocument();
    expect(screen.queryByText("navigation:sidebar.projects")).toBeNull();
    expect(screen.queryByText("navigation:sidebar.workspaceAdmin")).toBeNull();
    expect(screen.queryByText("navigation:sidebar.projectSettings")).toBeNull();
  });

  it("ensena el grupo completo a quien administra el espacio", () => {
    capabilities.canManageWorkspace = true;
    capabilities.canManageProjects = true;
    capabilities.canManageTeam = true;
    capabilities.canInviteUsers = true;
    renderNav();

    expect(screen.getByText("navigation:sidebar.projects")).toBeInTheDocument();
    expect(
      screen.getByText("navigation:sidebar.membersAndTeams"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("navigation:sidebar.workspaceAdmin"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("navigation:sidebar.projectSettings"),
    ).toBeInTheDocument();
  });

  // Sin proyectos no hay ajustes de proyecto que ensenar, igual que la vieja
  // pestana de Ajustes se deshabilitaba sola.
  it("omite los ajustes de proyecto cuando el espacio no tiene proyectos", () => {
    capabilities.canManageProjects = true;
    projects = [];

    renderNav();

    expect(screen.getByText("navigation:sidebar.projects")).toBeInTheDocument();
    expect(screen.queryByText("navigation:sidebar.projectSettings")).toBeNull();
  });
});
