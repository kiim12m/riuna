import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Contenedor de las redirecciones de la vieja pantalla de ajustes de workspace.
 *
 * No redirige el: si lo hiciera, su `beforeLoad` se adelantaria al del hijo
 * comodin y se perderia la sub-pagina que el enlace guardaba.
 */
export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/workspace",
)({
  component: () => <Outlet />,
});
