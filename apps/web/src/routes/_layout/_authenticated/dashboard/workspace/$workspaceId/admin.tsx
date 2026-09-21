import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Administracion del espacio.
 *
 * Es solo un contenedor: cada pantalla de dentro monta su propio
 * `WorkspaceLayout`, que ya trae la barra lateral y las migas. Lo que aporta
 * esta ruta es el sitio — antes estas pantallas vivian en `/dashboard/settings`,
 * fuera del layout con barra lateral y sin parametro de espacio en la URL.
 *
 * No lleva guarda de permisos: quien no administre no ve el grupo en la barra,
 * y quien entre por enlace directo se topa con la autorizacion de la API, que
 * es la unica que manda (`AGENTS.md`).
 */
export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/admin",
)({
  component: RouteComponent,
});

function RouteComponent() {
  return <Outlet />;
}
