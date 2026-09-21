import { redirect } from "@tanstack/react-router";
import getWorkspaces from "@/fetchers/workspace/get-workspaces";
import { authClient } from "@/lib/auth-client";
import type Workspace from "@/types/workspace";

/**
 * Los ajustes de espacio y de proyecto se mudaron a
 * `/dashboard/workspace/$workspaceId/admin/…`, dentro del layout con barra
 * lateral. Las rutas viejas se quedan como redireccion en lugar de borrarse:
 * hay enlaces guardados y pestanas abiertas apuntando ahi, y es la misma
 * cortesia que se tuvo con `/my-work` y `/panel` (ADR 031).
 *
 * La URL vieja no llevaba el espacio en ningun sitio —ese era justamente su
 * problema—, asi que hay que resolverlo por la organizacion activa de la
 * sesion, igual que hacia la pantalla a la que apuntaba.
 */
export async function redirectToAdmin(
  section: string,
  /**
   * El resto de la ruta vieja, cuando conserva su significado en la nueva.
   * `/dashboard/settings/workspace/roles` tiene su equivalente exacto en
   * `…/admin/workspace/roles`, y mandar a todo el mundo a `general` perdia la
   * pagina que el enlace guardaba.
   */
  rest?: string,
): Promise<never> {
  const target = rest ? `${section}/${rest}` : section;
  const session = await authClient.getSession();
  const activeWorkspaceId = session?.data?.session?.activeOrganizationId;

  if (activeWorkspaceId) {
    // `href` y no `to`: el destino se arma con `target`, que es una cadena
    // —`workspace/roles`, `project-settings`…— y no una de las rutas que el
    // router conoce en tiempo de compilacion. Con `to`, TypeScript rechaza
    // cualquier plantilla que no case con la union de rutas generada.
    throw redirect({
      href: `/dashboard/workspace/${activeWorkspaceId}/admin/${target}`,
      replace: true,
    });
  }

  let workspaces: Workspace[] = [];
  try {
    workspaces = await getWorkspaces();
  } catch {
    throw redirect({ to: "/onboarding", replace: true });
  }

  if (workspaces.length === 0) {
    throw redirect({ to: "/onboarding", replace: true });
  }

  throw redirect({
    href: `/dashboard/workspace/${workspaces[0].id}/admin/${target}`,
    replace: true,
  });
}
