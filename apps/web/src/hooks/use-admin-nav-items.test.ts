import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAdminNavItems } from "./use-admin-nav-items";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/hooks/queries/workspace/use-active-workspace", () => ({
  default: () => ({ data: { id: "ws-1", name: "Servitec" } }),
}));

let projects: Array<{ id: string }> = [];

vi.mock("@/hooks/queries/project/use-get-projects", () => ({
  default: () => ({ data: projects }),
}));

let role: string | null = null;

vi.mock("@/components/providers/auth-provider/hooks/use-auth", () => ({
  useAuth: () => ({ user: role ? { id: "u-1", role } : { id: "u-1" } }),
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

function titles() {
  return renderHook(() => useAdminNavItems()).result.current.map(
    (item) => item.title,
  );
}

beforeEach(() => {
  role = null;
  projects = [{ id: "project-1" }];
  for (const key of Object.keys(capabilities) as Array<
    keyof typeof capabilities
  >) {
    capabilities[key] = false;
  }
});

/**
 * La administracion del espacio en el menu del avatar (antes un grupo de la
 * barra lateral). La puerta son capacidades, no el rol.
 */
describe("useAdminNavItems", () => {
  // Quien no administra nada no ve nada, ni la etiqueta.
  it("no da nada sin ninguna capacidad", () => {
    expect(titles()).toEqual([]);
  });

  // Cada entrada tiene su propia puerta: quien solo puede invitar ve
  // miembros y nada mas.
  it("da solo las entradas cuya capacidad se tiene", () => {
    capabilities.canInviteUsers = true;
    expect(titles()).toEqual(["navigation:sidebar.membersAndTeams"]);
  });

  it("da todo a quien administra el espacio", () => {
    capabilities.canManageWorkspace = true;
    capabilities.canManageProjects = true;
    capabilities.canManageTeam = true;
    expect(titles()).toEqual([
      "navigation:sidebar.projects",
      "navigation:sidebar.membersAndTeams",
      "navigation:sidebar.workspaceAdmin",
      "navigation:sidebar.projectSettings",
    ]);
  });

  // El estado de la instancia es del admin de instancia, tenga o no
  // capacidades en este espacio (ADR 075).
  it("da el estado de la instancia solo al admin de instancia", () => {
    expect(titles()).not.toContain("navigation:sidebar.instanceStatus");
    role = "admin";
    expect(titles()).toEqual(["navigation:sidebar.instanceStatus"]);
  });

  // Sin proyectos no hay ajustes de proyecto que enseñar.
  it("omite los ajustes de proyecto cuando el espacio no tiene proyectos", () => {
    capabilities.canManageProjects = true;
    projects = [];
    expect(titles()).toEqual(["navigation:sidebar.projects"]);
  });
});
