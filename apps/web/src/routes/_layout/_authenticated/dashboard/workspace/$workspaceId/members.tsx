import { createFileRoute, redirect } from "@tanstack/react-router";

/** Los miembros pasan al grupo de administracion; el enlace viejo sigue vivo. */
export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/members",
)({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/dashboard/workspace/$workspaceId/admin/members",
      params,
      replace: true,
    });
  },
});
