import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * `…/admin/workspace` es un layout: sin sub-pagina rendeririza su menu y un
 * panel vacio. Se entra ahi desde la barra lateral y desde la redireccion de
 * `/dashboard/settings/workspace`, asi que tiene que llevar a algun sitio.
 */
export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/admin/workspace/",
)({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/dashboard/workspace/$workspaceId/admin/workspace/general",
      params,
      replace: true,
    });
  },
});
